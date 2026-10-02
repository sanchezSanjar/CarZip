import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CarStatus } from '@app/common/enums/car.enum';
import { MemberStatus, MemberType } from '@app/common/enums/member.enum';
import { NotificationGroup, NotificationType } from '@app/common/enums/notification.enum';
import { NotificationInput } from '@app/common/types/notification';

const DAY = 24 * 60 * 60 * 1000;
const STALE_AFTER = 30 * DAY; // an ACTIVE car the dealer has not touched for a month
const PENDING_TOO_LONG = 2 * DAY; // signup promises "usually within 24 hours"

type CarRow = { _id: Types.ObjectId; memberId: Types.ObjectId; carTitle: string };
type MemberRow = { _id: Types.ObjectId; memberNick: string; createdAt: Date };

/** reminders that keep CarZip honest: listings that may be outdated, agent applications nobody reviewed */
@Injectable()
export class ReminderBatchService {
	constructor(
		@InjectModel('Car') private readonly carModel: Model<CarRow>,
		@InjectModel('Member') private readonly memberModel: Model<MemberRow>,
		@InjectModel('Notification') private readonly notificationModel: Model<NotificationInput>,
	) {}

	/**
	 * An ACTIVE car the dealer has not created / edited / confirmed for 30 days may already be sold:
	 * ask the dealer "still for sale?". Asked again every 30 days while nothing changes. Never put on HOLD
	 * (user's decision): buyers still see it, the dealer decides. Returns how many dealers' cars were asked about.
	 */
	public async remindStaleListings(): Promise<number> {
		const cutoff = new Date(Date.now() - STALE_AFTER);
		const filter = {
			carStatus: CarStatus.ACTIVE,
			$and: [
				// last confirmed before the cutoff (cars from before carConfirmedAt existed: by createdAt)
				{
					$or: [
						{ carConfirmedAt: { $lt: cutoff } },
						{ carConfirmedAt: { $exists: false }, createdAt: { $lt: cutoff } },
					],
				},
				// and not asked in the last 30 days
				{ $or: [{ staleRemindedAt: { $exists: false } }, { staleRemindedAt: { $lt: cutoff } }] },
			],
		};
		const cars = await this.carModel.find(filter).select('memberId carTitle').lean<CarRow[]>().exec();
		let count = 0;
		for (const car of cars) {
			// mark first, only if still due: a second batch run (or the dealer confirming right now) wins the race
			const marked = await this.carModel
				.updateOne({ _id: car._id, ...filter }, { $set: { staleRemindedAt: new Date() } }, { timestamps: false })
				.exec();
			if (!marked.modifiedCount) continue;
			count++;
			await this.notificationModel.create({
				notificationType: NotificationType.LISTING_CHECK,
				notificationGroup: NotificationGroup.CAR,
				notificationTitle: `Is "${car.carTitle}" still for sale?`,
				notificationDesc: 'Confirm the listing, update it, or mark it sold so buyers see the right cars.',
				authorId: car.memberId, // a system message about the dealer's own car
				receiverId: car.memberId,
				carId: car._id,
			});
		}
		return count;
	}

	/**
	 * Agent applications waiting more than 48 hours: ONE summary notification per ACTIVE admin per run (daily),
	 * not one per applicant. Nothing is sent when no application is late. Returns how many are late.
	 */
	public async remindPendingAgents(): Promise<number> {
		const cutoff = new Date(Date.now() - PENDING_TOO_LONG);
		const late = await this.memberModel
			.find({ memberType: MemberType.AGENT, memberStatus: MemberStatus.PENDING, createdAt: { $lt: cutoff } })
			.select('memberNick createdAt')
			.sort({ createdAt: 1 })
			.lean<MemberRow[]>()
			.exec();
		if (!late.length) return 0;

		const admins = await this.memberModel
			.find({ memberType: MemberType.ADMIN, memberStatus: MemberStatus.ACTIVE })
			.select('_id')
			.lean<MemberRow[]>()
			.exec();
		const oldestDays = Math.floor((Date.now() - late[0].createdAt.getTime()) / DAY);
		const names =
			late
				.slice(0, 5)
				.map((m) => m.memberNick)
				.join(', ') + (late.length > 5 ? ', ...' : '');
		await this.notificationModel.insertMany(
			admins.map((admin) => ({
				notificationType: NotificationType.AGENT_APPLICATION,
				notificationGroup: NotificationGroup.MEMBER,
				notificationTitle: `${late.length} agent application(s) waiting more than 48 hours`,
				notificationDesc: `Oldest: ${oldestDays} day(s). ${names}`,
				authorId: late[0]._id, // the longest-waiting applicant
				receiverId: admin._id,
			})),
		);
		return late.length;
	}
}
