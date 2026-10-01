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
import { Comment, Comments } from '../../libs/dto/comment/comment';
import { CommentInput, CommentsInquiry } from '../../libs/dto/comment/comment.input';
import { CommentUpdate } from '../../libs/dto/comment/comment.update';
import { Car } from '../../libs/dto/car/car';
import { BoardArticle } from '../../libs/dto/board-article/board-article';
import { Member } from '../../libs/dto/member/member';
import { CommentGroup, CommentStatus } from '../../libs/enums/comment.enum';
import { CarStatus } from '../../libs/enums/car.enum';
import { BoardArticleStatus } from '../../libs/enums/board-article.enum';
import { MemberStatus } from '../../libs/enums/member.enum';
import { NotificationGroup, NotificationType } from '../../libs/enums/notification.enum';
import { Direction, Message } from '../../libs/enums/common.enum';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { lookupPublicMember } from '../../libs/utils/lookup';
import { NotificationService } from '../notification/notification.service';

/** what a comment is on: who owns it, and which counter / notification field belongs to it */
interface CommentTarget {
	ownerId: Types.ObjectId;
	title: string; // for the notification text
}

/**
 * Comments on cars, articles and member profiles (Search & Engage flowchart):
 * the target must exist, an agent's PERSONAL block stops a member from commenting on that agent's things,
 * the target's comment counter changes, and the owner gets a COMMENT notification.
 */
@Injectable()
export class CommentService {
	private readonly logger = new Logger('CommentService');

	constructor(
		@InjectModel('Comment') private readonly commentModel: Model<Comment>,
		@InjectModel('Car') private readonly carModel: Model<Car>, // target check + carComments
		@InjectModel('BoardArticle') private readonly boardArticleModel: Model<BoardArticle>, // target check + articleComments
		@InjectModel('Member') private readonly memberModel: Model<Member>, // target check + memberComments
		@InjectModel('Block') private readonly blockModel: Model<{ blockerId: unknown; blockedId: unknown }>, // personal blocks
		private readonly notificationService: NotificationService,
	) {}

	public async createComment(memberId: Types.ObjectId, input: CommentInput): Promise<Comment> {
		const refId = shapeIntoMongoObjectId(input.commentRefId);
		const target = await this.findTarget(input.commentGroup, refId);

		// flowchart: "blocks: has car owner blocked this member? yes -> Not allowed (personal block)"
		if (await this.blockModel.exists({ blockerId: target.ownerId, blockedId: memberId })) {
			throw new ForbiddenException(Message.COMMENT_BLOCKED);
		}

		let created: Comment;
		try {
			created = (await this.commentModel.create({ ...input, commentRefId: refId, memberId })).toObject();
		} catch (err: any) {
			this.logger.error(`createComment failed: ${err?.message ?? err}`);
			throw new InternalServerErrorException(Message.CREATE_FAILED);
		}
		await this.changeCounter(input.commentGroup, refId, 1);

		// flowchart: "Actor = owner? no -> notifications -> owner (COMMENT)"
		if (!target.ownerId.equals(memberId)) {
			await this.notificationService.notify({
				notificationType: NotificationType.COMMENT,
				notificationGroup: NOTIFICATION_GROUP[input.commentGroup],
				notificationTitle: `New comment on ${target.title}`,
				notificationDesc: input.commentContent.slice(0, 100),
				authorId: memberId,
				receiverId: target.ownerId,
				...(input.commentGroup === CommentGroup.CAR && { carId: refId }),
				...(input.commentGroup === CommentGroup.ARTICLE && { articleId: refId }),
			});
		}
		return created;
	}

	/** the author edits the TEXT of their own ACTIVE comment (deleting is admin moderation) */
	public async updateComment(memberId: Types.ObjectId, input: CommentUpdate): Promise<Comment> {
		const updated = await this.commentModel
			.findOneAndUpdate(
				{ _id: shapeIntoMongoObjectId(input._id), memberId, commentStatus: CommentStatus.ACTIVE },
				{ $set: { commentContent: input.commentContent } },
				{ new: true },
			)
			.lean<Comment>()
			.exec();
		// someone else's / deleted comment = "not found": never reveal or touch it
		if (!updated) throw new NotFoundException(Message.NO_DATA_FOUND);
		return updated;
	}

	/** ACTIVE comments of one car / article / profile, with each commenter's public data */
	public async getComments(input: CommentsInquiry): Promise<Comments> {
		const match = {
			commentRefId: shapeIntoMongoObjectId(input.search.commentRefId),
			commentStatus: CommentStatus.ACTIVE,
		};
		const direction = input.direction ?? Direction.DESC;
		// _id breaks ties: a comment never shows up on two pages or on none
		const sort: Record<string, Direction> = { [input.sort ?? 'createdAt']: direction, _id: direction };

		const [result] = await this.commentModel
			.aggregate<Comments>([
				{ $match: match },
				{ $sort: sort },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							...lookupPublicMember('memberData'),
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();
		return result ?? { list: [], metaCounter: [] };
	}

	/** ADMIN */

	/**
	 * Admin flowchart: "Comments -> status DELETE · $inc counters -1". Only admins delete comments.
	 * Soft delete: the comment leaves every list but stays in the DB as moderation history.
	 */
	public async removeCommentByAdmin(commentId: Types.ObjectId): Promise<Comment> {
		// ACTIVE -> DELETE in one atomic step: parallel requests can't lower the counter twice
		const removed = await this.commentModel
			.findOneAndUpdate(
				{ _id: commentId, commentStatus: CommentStatus.ACTIVE },
				{ $set: { commentStatus: CommentStatus.DELETE } },
				{ new: true },
			)
			.lean<Comment>()
			.exec();
		if (!removed) {
			if (await this.commentModel.exists({ _id: commentId })) throw new BadRequestException(Message.NOTHING_TO_UPDATE);
			throw new NotFoundException(Message.NO_DATA_FOUND);
		}
		await this.changeCounter(removed.commentGroup, new Types.ObjectId(String(removed.commentRefId)), -1);
		return removed;
	}

	/** the thing being commented on must exist and be ACTIVE; returns its owner */
	private async findTarget(group: CommentGroup, refId: Types.ObjectId): Promise<CommentTarget> {
		if (group === CommentGroup.CAR) {
			const car = await this.carModel
				.findOne({ _id: refId, carStatus: CarStatus.ACTIVE })
				.select('memberId carTitle')
				.lean<Car>()
				.exec();
			if (car) return { ownerId: new Types.ObjectId(String(car.memberId)), title: `your car "${car.carTitle}"` };
		} else if (group === CommentGroup.ARTICLE) {
			const article = await this.boardArticleModel
				.findOne({ _id: refId, articleStatus: BoardArticleStatus.ACTIVE })
				.select('memberId articleTitle')
				.lean<BoardArticle>()
				.exec();
			if (article)
				return {
					ownerId: new Types.ObjectId(String(article.memberId)),
					title: `your article "${article.articleTitle}"`,
				};
		} else {
			const member = await this.memberModel
				.findOne({ _id: refId, memberStatus: MemberStatus.ACTIVE })
				.select('_id')
				.lean<Member>()
				.exec();
			if (member) return { ownerId: refId, title: 'your profile' };
		}
		throw new NotFoundException(Message.NO_DATA_FOUND);
	}

	/** carComments / articleComments / memberComments of the target */
	private async changeCounter(group: CommentGroup, refId: Types.ObjectId, modifier: number): Promise<void> {
		if (group === CommentGroup.CAR) await this.carModel.updateOne({ _id: refId }, { $inc: { carComments: modifier } });
		else if (group === CommentGroup.ARTICLE) {
			await this.boardArticleModel.updateOne({ _id: refId }, { $inc: { articleComments: modifier } });
		} else await this.memberModel.updateOne({ _id: refId }, { $inc: { memberComments: modifier } });
	}
}

const NOTIFICATION_GROUP: Record<CommentGroup, NotificationGroup> = {
	[CommentGroup.CAR]: NotificationGroup.CAR,
	[CommentGroup.ARTICLE]: NotificationGroup.ARTICLE,
	[CommentGroup.MEMBER]: NotificationGroup.MEMBER,
};
