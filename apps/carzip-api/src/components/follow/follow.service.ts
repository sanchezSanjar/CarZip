import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	InternalServerErrorException,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Follower, Followers, Following, Followings } from '../../libs/dto/follow/follow';
import { FollowInquiry } from '../../libs/dto/follow/follow.input';
import { Member } from '../../libs/dto/member/member';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';
import { NotificationGroup, NotificationType } from '../../libs/enums/notification.enum';
import { Message } from '../../libs/enums/common.enum';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { lookupPublicMember } from '../../libs/utils/lookup';
import { NotificationService } from '../notification/notification.service';

/**
 * Following (the user's rule): only ACTIVE AGENTs can be followed; any logged-in USER, AGENT or ADMIN
 * can follow an agent; guests can't; nobody follows themselves. The agent's PERSONAL block applies.
 * memberFollowings (follower) and memberFollowers (agent) always match the real follow records.
 */
@Injectable()
export class FollowService {
	private readonly logger = new Logger('FollowService');

	constructor(
		@InjectModel('Follow') private readonly followModel: Model<Follower>,
		@InjectModel('Member') private readonly memberModel: Model<Member>, // target check + memberFollowers / memberFollowings
		@InjectModel('Block') private readonly blockModel: Model<{ blockerId: unknown; blockedId: unknown }>,
		private readonly notificationService: NotificationService,
	) {}

	public async subscribe(followerId: Types.ObjectId, followingId: Types.ObjectId): Promise<Follower> {
		if (followerId.equals(followingId)) throw new BadRequestException(Message.SELF_SUBSCRIPTION_DENIED);

		const target = await this.memberModel
			.findOne({ _id: followingId, memberStatus: MemberStatus.ACTIVE })
			.select('memberType')
			.lean<Member>()
			.exec();
		if (!target) throw new NotFoundException(Message.NO_DATA_FOUND);
		if (target.memberType !== MemberType.AGENT) throw new BadRequestException(Message.ONLY_AGENTS_FOLLOWABLE);
		if (await this.blockModel.exists({ blockerId: followingId, blockedId: followerId })) {
			throw new ForbiddenException(Message.FOLLOW_BLOCKED);
		}

		let created: Follower;
		try {
			created = (await this.followModel.create({ followingId, followerId })).toObject();
		} catch (err: any) {
			// the unique index refuses a second follow, also when two requests race
			if (err?.code === 11000) throw new BadRequestException(Message.ALREADY_FOLLOWING);
			this.logger.error(`subscribe failed: ${err?.message ?? err}`);
			throw new InternalServerErrorException(Message.CREATE_FAILED);
		}

		await Promise.all([
			this.memberModel.updateOne({ _id: followerId }, { $inc: { memberFollowings: 1 } }),
			this.memberModel.updateOne({ _id: followingId }, { $inc: { memberFollowers: 1 } }),
		]);
		await this.notificationService.notifyOnce({
			notificationType: NotificationType.FOLLOW,
			notificationGroup: NotificationGroup.MEMBER,
			notificationTitle: 'You have a new follower',
			authorId: followerId,
			receiverId: followingId,
		});
		return created;
	}

	public async unsubscribe(followerId: Types.ObjectId, followingId: Types.ObjectId): Promise<Follower> {
		// one atomic delete: two parallel unfollows can't both lower the counters
		const removed = await this.followModel.findOneAndDelete({ followingId, followerId }).lean<Follower>().exec();
		if (!removed) throw new BadRequestException(Message.NOT_FOLLOWING);

		await Promise.all([
			this.memberModel.updateOne({ _id: followerId }, { $inc: { memberFollowings: -1 } }),
			this.memberModel.updateOne({ _id: followingId }, { $inc: { memberFollowers: -1 } }),
		]);
		return removed;
	}

	/** the agents a member follows (search.followerId), with each agent's public data */
	public async getMemberFollowings(input: FollowInquiry): Promise<Followings> {
		if (!input.search.followerId) throw new BadRequestException(Message.FOLLOW_SEARCH_REQUIRED);
		const match = { followerId: shapeIntoMongoObjectId(input.search.followerId) };
		return this.page<Followings>(match, input, lookupPublicMember('followingData', 'followingId'));
	}

	/** the members following an agent (search.followingId), with each follower's public data */
	public async getMemberFollowers(input: FollowInquiry): Promise<Followers> {
		if (!input.search.followingId) throw new BadRequestException(Message.FOLLOW_SEARCH_REQUIRED);
		const match = { followingId: shapeIntoMongoObjectId(input.search.followingId) };
		return this.page<Followers>(match, input, lookupPublicMember('followerData', 'followerId'));
	}

	/** newest follows first, _id breaks ties so nobody shows up on two pages or on none */
	private async page<R extends { list: Follower[] | Following[] }>(
		match: Record<string, unknown>,
		input: FollowInquiry,
		lookup: ReturnType<typeof lookupPublicMember>,
	): Promise<R> {
		const [result] = await this.followModel
			.aggregate<R>([
				{ $match: match },
				{ $sort: { createdAt: -1, _id: -1 } },
				{
					$facet: {
						list: [{ $skip: (input.page - 1) * input.limit }, { $limit: input.limit }, ...lookup],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();
		return result ?? ({ list: [], metaCounter: [] } as unknown as R);
	}
}
