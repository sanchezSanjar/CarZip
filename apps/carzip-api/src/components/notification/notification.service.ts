import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { NotificationInput } from '../../libs/dto/notification/notification.input';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';

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
