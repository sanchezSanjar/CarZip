import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { NotificationInput } from '@app/common/types/notification';
import { MemberStatus, MemberType } from '@app/common/enums/member.enum';
import { NotificationStatus } from '@app/common/enums/notification.enum';
import { Notifications } from '../../libs/dto/notification/notification';
import { NotificationsInquiry } from '../../libs/dto/notification/notification.input';
import { lookupPublicMember } from '../../libs/utils/lookup';
import { shapeIntoMongoObjectId } from '../../libs/config';

/**
 * Creates notifications for other modules, and lets each member read their own.
 * Creating is a side effect: if saving fails, the main action (approve, like, signup...) must still succeed,
 * so those errors are logged, not thrown.
 */
@Injectable()
export class NotificationService {
	private readonly logger = new Logger('NotificationService');

	constructor(
		@InjectModel('Notification') private readonly notificationModel: Model<NotificationInput>,
		@InjectModel('Member') private readonly memberModel: Model<{ _id: Types.ObjectId }>,
	) {}

	public async notify(input: NotificationInput): Promise<void> {
		try {
			await this.notificationModel.create(input);
		} catch (err: any) {
			this.logger.error(`${input.notificationType} -> ${input.receiverId} failed: ${err?.message ?? err}`);
		}
	}

	/**
	 * Like notify(), but only the first time: the same author, receiver, type and item never notify twice.
	 * For likes: like -> un-like -> like (or a tap-happy user) must not flood the receiver.
	 * Only for notification types covered by a unique index in Notification.model.ts (LIKE, FOLLOW).
	 */
	public async notifyOnce(input: NotificationInput): Promise<void> {
		// no "check, then insert": two parallel taps would both pass the check. The unique index on
		// LIKE notifications (Notification.model.ts) refuses the second insert atomically instead.
		try {
			await this.notificationModel.create(input);
		} catch (err: any) {
			if (err?.code === 11000) return; // already notified once: that's the point
			this.logger.error(`${input.notificationType} -> ${input.receiverId} failed: ${err?.message ?? err}`);
		}
	}

	/** the car / article is removed for good: notifications pointing at it would lead nowhere */
	public async removeFor(target: { carId: Types.ObjectId } | { articleId: Types.ObjectId }): Promise<number> {
		return (await this.notificationModel.deleteMany(target).exec()).deletedCount;
	}

	/** the member's own notifications, newest first, each with its author's PUBLIC profile */
	public async getNotifications(receiverId: Types.ObjectId, input: NotificationsInquiry): Promise<Notifications> {
		const match: Record<string, unknown> = { receiverId };
		if (input.search?.notificationStatus) match.notificationStatus = input.search.notificationStatus;
		if (input.search?.notificationGroup) match.notificationGroup = input.search.notificationGroup;
		const [result] = await this.notificationModel
			.aggregate<Notifications>([
				{ $match: match },
				{ $sort: { createdAt: -1, _id: -1 } },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							...lookupPublicMember('authorData', 'authorId'),
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();
		return result ?? { list: [], metaCounter: [] };
	}

	/** for the bell badge */
	public async countUnread(receiverId: Types.ObjectId): Promise<number> {
		return this.notificationModel.countDocuments({ receiverId, notificationStatus: NotificationStatus.WAIT }).exec();
	}

	/**
	 * Marks the member's OWN unread notifications as READ: the given ones, or all of them. Someone else's ids
	 * are ignored, not reported (no way to probe which ids exist). Returns how many changed. Reading starts
	 * the 90-day countdown after which MongoDB deletes the notification (TTL index on updatedAt).
	 */
	public async markRead(receiverId: Types.ObjectId, notificationIds?: string[]): Promise<number> {
		const filter: Record<string, unknown> = { receiverId, notificationStatus: NotificationStatus.WAIT };
		if (notificationIds) filter._id = { $in: notificationIds.map((id) => shapeIntoMongoObjectId(id)) };
		const result = await this.notificationModel
			.updateMany(filter, { $set: { notificationStatus: NotificationStatus.READ } })
			.exec();
		return result.modifiedCount;
	}

	/** one notification per ACTIVE admin, e.g. "a new agent is waiting for review" */
	public async notifyAdmins(input: Omit<NotificationInput, 'receiverId'>): Promise<void> {
		try {
			const admins = await this.memberModel
				.find({ memberType: MemberType.ADMIN, memberStatus: MemberStatus.ACTIVE })
				.select('_id')
				.lean()
				.exec();
			if (!admins.length) return;
			await this.notificationModel.insertMany(admins.map((admin) => ({ ...input, receiverId: admin._id })));
		} catch (err: any) {
			this.logger.error(`${input.notificationType} -> admins failed: ${err?.message ?? err}`);
		}
	}
}
