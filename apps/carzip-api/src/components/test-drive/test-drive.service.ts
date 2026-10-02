import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { TestDrive, TestDrives } from '../../libs/dto/test-drive/test-drive';
import { TestDriveInput, TestDrivesInquiry, TestDriveUpdate } from '../../libs/dto/test-drive/test-drive.input';
import { Car } from '../../libs/dto/car/car';
import { CarStatus } from '../../libs/enums/car.enum';
import { Direction, Message } from '../../libs/enums/common.enum';
import { MemberType } from '../../libs/enums/member.enum';
import { NotificationGroup, NotificationType } from '../../libs/enums/notification.enum';
import { TestDriveStatus } from '../../libs/enums/test-drive.enum';
import { AuthMemberData } from '../../libs/types/auth';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { lookupPublicMember } from '../../libs/utils/lookup';
import { NotificationService } from '../notification/notification.service';

const DAY = 24 * 60 * 60 * 1000;
const MAX_DAYS_AHEAD = 60; // a request further away is almost surely a typo
const MAX_OPEN_PER_BUYER = 10; // one buyer can't flood dealers with requests
/** still waiting for the meeting: these block a new request and are cancelled when the car leaves the market */
const OPEN_STATUSES = [TestDriveStatus.REQUEST, TestDriveStatus.CONFIRM];

/**
 * Test Drive flowchart: who may move a test drive from which status to which.
 * Once the date is agreed (CONFIRM), EITHER side may cancel, at any time (also after the date: a no-show).
 * The dealer answers an unconfirmed REQUEST with REJECT, not CANCEL.
 */
const SELLER_MOVES: Partial<Record<TestDriveStatus, TestDriveStatus[]>> = {
	[TestDriveStatus.CONFIRM]: [TestDriveStatus.REQUEST],
	[TestDriveStatus.REJECT]: [TestDriveStatus.REQUEST],
	[TestDriveStatus.COMPLETE]: [TestDriveStatus.CONFIRM],
	[TestDriveStatus.CANCEL]: [TestDriveStatus.CONFIRM],
};
const BUYER_MOVES: Partial<Record<TestDriveStatus, TestDriveStatus[]>> = {
	[TestDriveStatus.CANCEL]: [TestDriveStatus.REQUEST, TestDriveStatus.CONFIRM],
};

const CAR_FIELDS = { carTitle: 1, carBrand: 1, carModel: 1, carYear: 1, carStatus: 1, carImages: 1 };

type Viewer = 'buyer' | 'seller';
type OpenTestDrive = { _id: Types.ObjectId; carId: Types.ObjectId; memberId: Types.ObjectId; sellerId: Types.ObjectId };

@Injectable()
export class TestDriveService {
	constructor(
		@InjectModel('TestDrive') private readonly testDriveModel: Model<TestDrive>,
		@InjectModel('Car') private readonly carModel: Model<Car>,
		@InjectModel('Block') private readonly blockModel: Model<{ blockerId: Types.ObjectId; blockedId: Types.ObjectId }>,
		private readonly notificationService: NotificationService,
	) {}

	/**
	 * Test Drive flowchart, buyer side: car ACTIVE with test drives on, not the buyer's own car,
	 * not blocked by the dealer, a date in the future, no open request for this car yet.
	 * The seller comes from the car in the DB, never from the client. The dealer gets a TEST_DRIVE notification.
	 */
	public async requestTestDrive(memberId: Types.ObjectId, input: TestDriveInput): Promise<TestDrive> {
		const carId = shapeIntoMongoObjectId(input.carId);
		const car = await this.carModel
			.findOne({ _id: carId, carStatus: CarStatus.ACTIVE, carTestDrive: true })
			.select('memberId carTitle')
			.lean<Car>()
			.exec();
		if (!car) throw new BadRequestException(Message.TEST_DRIVE_NOT_AVAILABLE);
		const sellerId = new Types.ObjectId(String(car.memberId));
		if (sellerId.equals(memberId)) throw new BadRequestException(Message.TEST_DRIVE_OWN_CAR);
		if (await this.blockModel.exists({ blockerId: sellerId, blockedId: memberId }).exec()) {
			throw new ForbiddenException(Message.TEST_DRIVE_BLOCKED);
		}

		const date = input.testDriveDate.getTime();
		if (Number.isNaN(date) || date <= Date.now() || date > Date.now() + MAX_DAYS_AHEAD * DAY) {
			throw new BadRequestException(Message.TEST_DRIVE_DATE_INVALID);
		}

		const [openForCar, openTotal] = await Promise.all([
			this.testDriveModel.exists({ carId, memberId, testDriveStatus: { $in: OPEN_STATUSES } }).exec(),
			this.testDriveModel.countDocuments({ memberId, testDriveStatus: TestDriveStatus.REQUEST }).exec(),
		]);
		if (openForCar) throw new BadRequestException(Message.TEST_DRIVE_ALREADY_OPEN);
		if (openTotal >= MAX_OPEN_PER_BUYER) throw new BadRequestException(Message.TEST_DRIVE_TOO_MANY_OPEN);

		let created: { _id: unknown };
		try {
			created = await this.testDriveModel.create({
				carId,
				memberId,
				sellerId,
				testDriveDate: input.testDriveDate,
				testDriveMessage: input.testDriveMessage?.trim() || undefined,
			});
		} catch (err: any) {
			// two requests at the same moment: the unique index (one REQUEST per buyer and car) refuses the second
			if (err?.code === 11000) throw new BadRequestException(Message.TEST_DRIVE_ALREADY_OPEN);
			throw err;
		}

		await this.notificationService.notify({
			notificationType: NotificationType.TEST_DRIVE,
			notificationGroup: NotificationGroup.CAR,
			notificationTitle: `New test-drive request for "${car.carTitle}"`,
			notificationDesc: `Requested date: ${input.testDriveDate.toISOString()}`,
			authorId: memberId,
			receiverId: sellerId,
			carId,
		});
		return this.getOne(shapeIntoMongoObjectId(String(created._id)), 'buyer');
	}

	/**
	 * Test Drive flowchart, after the request. The dealer: REQUEST -> CONFIRM (before the date) / REJECT,
	 * CONFIRM -> COMPLETE (after the date). Either side: CONFIRM -> CANCEL at any time; the buyer may also cancel
	 * their REQUEST. Each side only on their own test drives. One atomic step on the current status:
	 * a confirm and a cancel at the same moment can't both win.
	 */
	public async updateTestDrive(viewer: AuthMemberData, input: TestDriveUpdate): Promise<TestDrive> {
		const _id = shapeIntoMongoObjectId(input._id);
		const role: Viewer = viewer.memberType === MemberType.AGENT ? 'seller' : 'buyer';
		const owner = role === 'seller' ? { sellerId: viewer._id } : { memberId: viewer._id };
		const current = await this.testDriveModel
			.findOne({ _id, ...owner })
			.lean<OpenTestDrive & TestDrive>()
			.exec();
		if (!current) throw new NotFoundException(Message.NO_DATA_FOUND); // not theirs looks the same as missing

		const next = input.testDriveStatus;
		const from = (role === 'seller' ? SELLER_MOVES : BUYER_MOVES)[next];
		if (!from?.includes(current.testDriveStatus)) throw new BadRequestException(Message.TEST_DRIVE_STATUS_DENIED);

		const now = new Date();
		const isPast = current.testDriveDate.getTime() <= now.getTime();
		if (next === TestDriveStatus.CONFIRM && isPast) throw new BadRequestException(Message.TEST_DRIVE_DATE_PASSED);
		if (next === TestDriveStatus.COMPLETE && !isPast) throw new BadRequestException(Message.TEST_DRIVE_NOT_YET);

		let car: Car | null = null;
		if (next !== TestDriveStatus.CANCEL) {
			car = await this.carModel.findById(current.carId).select('carTitle carStatus').lean<Car>().exec();
		}
		if (next === TestDriveStatus.CONFIRM && car?.carStatus !== CarStatus.ACTIVE) {
			throw new BadRequestException(Message.TEST_DRIVE_CAR_NOT_ACTIVE);
		}

		const updated = await this.testDriveModel
			.findOneAndUpdate(
				{ _id, ...owner, testDriveStatus: current.testDriveStatus },
				{ $set: { testDriveStatus: next } },
			)
			.exec();
		if (!updated) throw new BadRequestException(Message.TEST_DRIVE_STATUS_DENIED); // changed meanwhile

		car ??= await this.carModel.findById(current.carId).select('carTitle').lean<Car>().exec();
		const title = car?.carTitle ?? 'your car';
		const texts: Record<string, string> = {
			[TestDriveStatus.CONFIRM]: `Your test drive for "${title}" is confirmed`,
			[TestDriveStatus.REJECT]: `Your test-drive request for "${title}" was declined. You may request another date.`,
			[TestDriveStatus.COMPLETE]: `Your test drive for "${title}" is completed`,
			[TestDriveStatus.CANCEL]:
				role === 'seller'
					? `The dealer cancelled your test drive for "${title}"`
					: `A buyer cancelled the test drive for "${title}"`,
		};
		await this.notificationService.notify({
			notificationType: NotificationType.TEST_DRIVE,
			notificationGroup: NotificationGroup.CAR,
			notificationTitle: texts[next],
			notificationDesc: `Test drive date: ${current.testDriveDate.toISOString()}`,
			authorId: viewer._id,
			receiverId: role === 'seller' ? current.memberId : current.sellerId,
			carId: current.carId,
		});
		return this.getOne(_id, role);
	}

	/** the buyer's requests, with each car and its dealer's public profile */
	public async getMyTestDrives(memberId: Types.ObjectId, input: TestDrivesInquiry): Promise<TestDrives> {
		return this.page({ memberId }, input, 'buyer');
	}

	/** the dealer's test-drive inbox, with each car and the buyer (phone only after CONFIRM) */
	public async getAgentTestDrives(sellerId: Types.ObjectId, input: TestDrivesInquiry): Promise<TestDrives> {
		return this.page({ sellerId }, input, 'seller');
	}

	/** the car left the market (SOLD / DELETE / HOLD): its open test drives are cancelled, the buyers told why */
	public async cancelForCar(carId: Types.ObjectId, reason: string, authorId: Types.ObjectId): Promise<number> {
		return this.cancelOpen({ carId }, reason, authorId, 'buyer');
	}

	/** the dealer was blocked / deleted by an admin: every open test drive on their cars is cancelled */
	public async cancelForSeller(sellerId: Types.ObjectId, reason: string, authorId: Types.ObjectId): Promise<number> {
		return this.cancelOpen({ sellerId }, reason, authorId, 'buyer');
	}

	/** the buyer was blocked / deleted by an admin: their open requests are cancelled, the dealers told */
	public async cancelForBuyer(memberId: Types.ObjectId, reason: string, authorId: Types.ObjectId): Promise<number> {
		return this.cancelOpen({ memberId }, reason, authorId, 'seller');
	}

	/** the car is removed for good (removeCarByAdmin): its test-drive history goes with it */
	public async removeForCar(carId: Types.ObjectId): Promise<number> {
		return (await this.testDriveModel.deleteMany({ carId }).exec()).deletedCount;
	}

	/** cancel the open test drives matching `match` and notify the other side (`notifyWho`) of each one */
	private async cancelOpen(
		match: Record<string, Types.ObjectId>,
		reason: string,
		authorId: Types.ObjectId,
		notifyWho: Viewer,
	): Promise<number> {
		const filter = { ...match, testDriveStatus: { $in: OPEN_STATUSES } };
		const open = await this.testDriveModel
			.find(filter)
			.select('carId memberId sellerId')
			.lean<OpenTestDrive[]>()
			.exec();
		if (!open.length) return 0;

		const result = await this.testDriveModel
			.updateMany(
				{ _id: { $in: open.map((td) => td._id) }, testDriveStatus: { $in: OPEN_STATUSES } },
				{
					$set: { testDriveStatus: TestDriveStatus.CANCEL },
				},
			)
			.exec();

		const cars = await this.carModel
			.find({ _id: { $in: [...new Set(open.map((td) => String(td.carId)))] } })
			.select('carTitle')
			.lean<(Car & { _id: Types.ObjectId })[]>()
			.exec();
		const titles = new Map(cars.map((car) => [String(car._id), car.carTitle]));
		await Promise.all(
			open.map((td) =>
				this.notificationService.notify({
					notificationType: NotificationType.TEST_DRIVE,
					notificationGroup: NotificationGroup.CAR,
					notificationTitle: `The test drive for "${titles.get(String(td.carId)) ?? 'a car'}" was cancelled`,
					notificationDesc: reason,
					authorId,
					receiverId: notifyWho === 'buyer' ? td.memberId : td.sellerId,
					carId: td.carId,
				}),
			),
		);
		return result.modifiedCount;
	}

	private async getOne(_id: Types.ObjectId, viewer: Viewer): Promise<TestDrive> {
		const [testDrive] = await this.testDriveModel
			.aggregate<TestDrive>([{ $match: { _id } }, ...this.lookups(viewer)])
			.exec();
		if (!testDrive) throw new NotFoundException(Message.NO_DATA_FOUND);
		return testDrive;
	}

	private async page(match: Record<string, unknown>, input: TestDrivesInquiry, viewer: Viewer): Promise<TestDrives> {
		if (input.search?.testDriveStatus) match.testDriveStatus = input.search.testDriveStatus;
		const sortField = input.sort ?? 'createdAt';
		const direction = input.direction ?? Direction.DESC;
		const [result] = await this.testDriveModel
			.aggregate<TestDrives>([
				{ $match: match },
				{ $sort: { [sortField]: direction, _id: direction } },
				{
					$facet: {
						list: [{ $skip: (input.page - 1) * input.limit }, { $limit: input.limit }, ...this.lookups(viewer)],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();
		return result ?? { list: [], metaCounter: [] };
	}

	/**
	 * Car data for everyone. The buyer sees the dealer's PUBLIC profile. The dealer sees the buyer's nick and image,
	 * plus the verified phone only once they CONFIRMed (user's privacy rule): a dealer who rejects never gets the number.
	 */
	private lookups(viewer: Viewer): PipelineStage.FacetPipelineStage[] {
		const car: PipelineStage.FacetPipelineStage[] = [
			{
				$lookup: {
					from: 'cars',
					localField: 'carId',
					foreignField: '_id',
					as: 'carData',
					pipeline: [{ $project: CAR_FIELDS }],
				},
			},
			{ $unwind: { path: '$carData', preserveNullAndEmptyArrays: true } },
		];
		if (viewer === 'buyer') return [...car, ...lookupPublicMember('sellerData', 'sellerId')];
		return [
			...car,
			{
				$lookup: {
					from: 'members',
					localField: 'memberId',
					foreignField: '_id',
					as: 'buyerData',
					pipeline: [{ $project: { memberNick: 1, memberImage: 1, memberPhone: 1 } }],
				},
			},
			{ $unwind: { path: '$buyerData', preserveNullAndEmptyArrays: true } },
			{
				$set: {
					'buyerData.memberPhone': {
						$cond: [
							{ $in: ['$testDriveStatus', [TestDriveStatus.CONFIRM, TestDriveStatus.COMPLETE]] },
							'$buyerData.memberPhone',
							'$$REMOVE',
						],
					},
				},
			},
		];
	}
}
