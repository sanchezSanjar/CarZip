import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TestDriveStatus } from '@app/common/enums/test-drive.enum';
import { NotificationGroup, NotificationType } from '@app/common/enums/notification.enum';
import { NotificationInput } from '@app/common/types/notification';

const HOUR = 60 * 60 * 1000;
const REMIND_BEFORE = 24 * HOUR; // "your test drive is coming up" about a day before
const FOLLOW_UP_AFTER = 3 * HOUR; // the meeting should be over 3 hours after its start

interface TestDriveRow {
	_id: Types.ObjectId;
	carId: Types.ObjectId;
	memberId: Types.ObjectId; // buyer
	sellerId: Types.ObjectId; // dealer
	testDriveDate: Date;
}

/**
 * Test-drive housekeeping (Test Drive flowchart + the user's rules). Never marks a test drive COMPLETE:
 * only the dealer knows whether it happened.
 * Every change is "only if it is still in that state", so a job running twice (or alongside the API)
 * never cancels a test drive the dealer just confirmed, and never sends the same message twice.
 */
@Injectable()
export class TestDriveBatchService {
	constructor(
		@InjectModel('TestDrive') private readonly testDriveModel: Model<TestDriveRow>,
		@InjectModel('Car') private readonly carModel: Model<{ _id: Types.ObjectId; carTitle: string }>,
		@InjectModel('Notification') private readonly notificationModel: Model<NotificationInput>,
	) {}

	/** a REQUEST the dealer never answered before its date can't happen any more: CANCEL, tell both sides */
	public async expireUnanswered(): Promise<number> {
		const due = await this.find({ testDriveStatus: TestDriveStatus.REQUEST, testDriveDate: { $lte: new Date() } });
		const titles = await this.carTitles(due);
		let count = 0;
		for (const td of due) {
			const changed = await this.testDriveModel
				.updateOne(
					{ _id: td._id, testDriveStatus: TestDriveStatus.REQUEST },
					{ $set: { testDriveStatus: TestDriveStatus.CANCEL } },
				)
				.exec();
			if (!changed.modifiedCount) continue; // answered or cancelled meanwhile
			count++;
			const title = titles.get(String(td.carId)) ?? 'a car';
			await this.notify(
				td,
				td.memberId,
				td.sellerId,
				`Your test-drive request for "${title}" expired: the dealer did not answer before the date. You may request another date.`,
			);
			await this.notify(td, td.sellerId, td.memberId, `A test-drive request for "${title}" expired without an answer`);
		}
		return count;
	}

	/** a CONFIRMed test drive within the next 24 hours: remind both sides, once */
	public async remindUpcoming(): Promise<number> {
		const now = Date.now();
		const due = await this.find({
			testDriveStatus: TestDriveStatus.CONFIRM,
			testDriveDate: { $gt: new Date(now), $lte: new Date(now + REMIND_BEFORE) },
			remindedAt: { $exists: false },
		});
		const titles = await this.carTitles(due);
		let count = 0;
		for (const td of due) {
			if (!(await this.markOnce(td._id, 'remindedAt'))) continue;
			count++;
			const title = titles.get(String(td.carId)) ?? 'a car';
			await this.notify(td, td.memberId, td.sellerId, `Reminder: your test drive for "${title}" is coming up`);
			await this.notify(td, td.sellerId, td.memberId, `Reminder: a test drive for "${title}" is coming up`);
		}
		return count;
	}

	/** a CONFIRMed test drive whose time has passed: ask the dealer, once, to mark it COMPLETE or CANCEL it */
	public async followUpPast(): Promise<number> {
		const due = await this.find({
			testDriveStatus: TestDriveStatus.CONFIRM,
			testDriveDate: { $lte: new Date(Date.now() - FOLLOW_UP_AFTER) },
			followUpAt: { $exists: false },
		});
		const titles = await this.carTitles(due);
		let count = 0;
		for (const td of due) {
			if (!(await this.markOnce(td._id, 'followUpAt'))) continue;
			count++;
			await this.notify(
				td,
				td.sellerId,
				td.memberId,
				`Did the test drive for "${titles.get(String(td.carId)) ?? 'a car'}" happen? Mark it complete, or cancel it if it did not.`,
			);
		}
		return count;
	}

	private find(filter: Record<string, unknown>): Promise<TestDriveRow[]> {
		return this.testDriveModel
			.find(filter)
			.select('carId memberId sellerId testDriveDate')
			.sort({ testDriveDate: 1 })
			.lean<TestDriveRow[]>()
			.exec();
	}

	/** set the "already sent" date if it is not set yet, and only while still CONFIRM. false = someone else did it */
	private async markOnce(_id: Types.ObjectId, field: 'remindedAt' | 'followUpAt'): Promise<boolean> {
		const result = await this.testDriveModel
			.updateOne(
				{ _id, testDriveStatus: TestDriveStatus.CONFIRM, [field]: { $exists: false } },
				{ $set: { [field]: new Date() } },
			)
			.exec();
		return result.modifiedCount === 1;
	}

	private async carTitles(rows: TestDriveRow[]): Promise<Map<string, string>> {
		if (!rows.length) return new Map();
		const cars = await this.carModel
			.find({ _id: { $in: [...new Set(rows.map((td) => String(td.carId)))] } })
			.select('carTitle')
			.lean()
			.exec();
		return new Map(cars.map((car) => [String(car._id), car.carTitle]));
	}

	/** a system notification about this test drive. authorId = the other side of the test drive */
	private async notify(td: TestDriveRow, receiverId: Types.ObjectId, authorId: Types.ObjectId, title: string) {
		await this.notificationModel.create({
			notificationType: NotificationType.TEST_DRIVE,
			notificationGroup: NotificationGroup.CAR,
			notificationTitle: title,
			notificationDesc: `Test drive date: ${td.testDriveDate.toISOString()}`,
			authorId,
			receiverId,
			carId: td.carId,
		});
	}
}
