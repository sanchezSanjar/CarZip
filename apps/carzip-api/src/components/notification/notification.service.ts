import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { NotificationInput } from '@app/common/types/notification';
import { MemberStatus, MemberType } from '@app/common/enums/member.enum';

/**
 * Creates notifications for other modules. A notification is a side effect:
 * if saving it fails, the main action (approve, like, signup...) must still succeed, so errors are logged, not thrown.
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
