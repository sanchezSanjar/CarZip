import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	InternalServerErrorException,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Error as MongooseError, Model, Types } from 'mongoose';
import { AgentPublic, Car, Cars, CarsPage } from '../../libs/dto/car/car';
import { AgentCarsInquiry, AllCarsInquiry, CarInput, CarsInquiry, OrdinaryInquiry } from '../../libs/dto/car/car.input';
import { CarUpdate, CarUpdateByAdmin } from '../../libs/dto/car/car.update';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Member } from '../../libs/dto/member/member';
import { CarMarket, CarSort, CarStatus } from '../../libs/enums/car.enum';
import { UploadTarget } from '../../libs/enums/upload.enum';
import { Message } from '../../libs/enums/common.enum';
import { UploadService } from '../upload/upload.service';
import { ViewService } from '../view/view.service';
import { LikeService } from '../like/like.service';
import { NotificationService } from '../notification/notification.service';
import { LikeGroup } from '../../libs/enums/like.enum';
import { NotificationGroup, NotificationType } from '../../libs/enums/notification.enum';
import { ViewGroup } from '../../libs/enums/view.enum';
import { MemberType } from '../../libs/enums/member.enum';
import { Direction } from '../../libs/enums/common.enum';
import { AuthMemberData } from '../../libs/types/auth';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { buildCarsPipeline, lookupAgentData, toPage } from '../../libs/utils/car-query';
import { PUBLIC_MEMBER_FIELDS } from '../../libs/utils/lookup';

// what a car page shows about its agent (= AgentPublic). Verification data is never selected.
const AGENT_PUBLIC_FIELDS = PUBLIC_MEMBER_FIELDS.join(' ');

@Injectable()
export class CarService {
	private readonly logger = new Logger('CarService');

	constructor(
		@InjectModel('Car') private readonly carModel: Model<Car>,
		@InjectModel('Member') private readonly memberModel: Model<Member>,
		private readonly uploadService: UploadService,
		private readonly viewService: ViewService,
		private readonly likeService: LikeService,
		private readonly notificationService: NotificationService,
		@InjectModel('Block') private readonly blockModel: Model<{ blockerId: unknown; blockedId: unknown }>,
	) {}

	/**
	 * Car Listing flowchart: createCar(input), memberId from the JWT -> cars: insert ACTIVE -> memberCars +1.
	 * CarInput already validated model ∈ brand, prices vs market, export agreement and no rent on export-only;
	 * Car.model.ts checks the same rules again as a last line of defence.
	 */
	public async createCar(memberId: Types.ObjectId, input: CarInput): Promise<Car> {
		// photos must come from our upload API: no hot-linked or tracking images in listings
		if (input.carImages.some((url) => !this.uploadService.isUploadedImage(url, UploadTarget.CAR))) {
			throw new BadRequestException(Message.CAR_IMAGES_NOT_UPLOADED);
		}

		const data: Record<string, unknown> = { ...input, memberId, carStatus: CarStatus.ACTIVE };
		delete data.exportAgreed; // a checkbox, not stored: we store WHEN it was ticked
		// EXPORT / BOTH: CarInput required exportAgreed === true, record the moment the dealer accepted
		if (input.carMarket !== CarMarket.DOMESTIC) data.carExportAgreedAt = new Date();
		if (!input.carRent) delete data.carRentPrice;

		let created: Car;
		try {
			created = (await this.carModel.create(data)).toObject();
		} catch (err: any) {
			if (err instanceof MongooseError.ValidationError) {
				throw new BadRequestException(Object.values(err.errors)[0]?.message ?? Message.CREATE_FAILED);
			}
			if (err?.message === 'Export-only cars cannot be offered for rent') throw new BadRequestException(err.message);
			this.logger.error(`createCar failed: ${err?.message ?? err}`);
			throw new InternalServerErrorException(Message.CREATE_FAILED);
		}

		await this.memberModel.updateOne({ _id: memberId }, { $inc: { memberCars: 1 } });
		return created;
	}

	/**
	 * Car Listing flowchart, "Agent action (own cars only)": edit, pause (HOLD), re-activate, SOLD, DELETE.
	 * - another agent's car = "not found" (never reveal it, never touch it)
	 * - SOLD and DELETE are final
	 * - edits are merged with the saved car and the RESULT must pass the createCar rules (CarInput)
	 * - DELETE: memberCars -1. SOLD and HOLD keep the counter (as in the flowchart)
	 */
	public async updateCar(memberId: Types.ObjectId, input: CarUpdate): Promise<Car> {
		const carId = shapeIntoMongoObjectId(input._id);
		const car = await this.carModel.findOne({ _id: carId, memberId }).lean<Car>().exec();
		if (!car || car.carStatus === CarStatus.DELETE) throw new NotFoundException(Message.NO_DATA_FOUND);
		if (car.carStatus === CarStatus.SOLD) throw new BadRequestException(Message.CAR_SOLD_FINAL);

		// the field edits the client actually sent (status and the export checkbox are handled separately)
		const changes: Record<string, unknown> = Object.fromEntries(
			Object.entries(input).filter(
				([key, value]) => value !== undefined && value !== null && !['_id', 'carStatus', 'exportAgreed'].includes(key),
			),
		);
		const newStatus = input.carStatus && input.carStatus !== car.carStatus ? input.carStatus : undefined;
		if (!Object.keys(changes).length && !newStatus) throw new BadRequestException(Message.NOTHING_TO_UPDATE);
		// an ADMIN hold: the dealer may fix the listing or delete it, but only an admin lifts the hold
		if (car.carHoldReason && newStatus === CarStatus.ACTIVE) {
			throw new ForbiddenException(`${Message.CAR_HELD_BY_ADMIN}: ${car.carHoldReason}`);
		}

		const $set: Record<string, unknown> = { ...changes };
		const $unset: Record<string, ''> = {};
		if (Object.keys(changes).length) {
			if (input.carImages?.some((url) => !this.uploadService.isUploadedImage(url, UploadTarget.CAR))) {
				throw new BadRequestException(Message.CAR_IMAGES_NOT_UPLOADED);
			}
			// the car as it would be after this change must still be a valid listing
			const exportAgreed = input.exportAgreed ?? (car.carExportAgreedAt ? true : undefined);
			await this.assertValidListing({ ...car, ...changes, exportAgreed });

			// keep the stored car consistent with its market and rent option (like Car.model's pre-validate hook)
			const market = (changes.carMarket as CarMarket) ?? car.carMarket;
			const rent = (changes.carRent as boolean) ?? car.carRent;
			const unset = (key: string) => {
				$unset[key] = '';
				delete $set[key];
			};
			if (market === CarMarket.EXPORT) unset('carPrice');
			if (market === CarMarket.DOMESTIC) {
				unset('carPriceUsd');
				unset('carExportAgreedAt');
			} else if (!car.carExportAgreedAt) {
				$set.carExportAgreedAt = new Date(); // switched to EXPORT / BOTH: the dealer just accepted
			}
			if (!rent) unset('carRentPrice');
		}

		if (newStatus) {
			$set.carStatus = newStatus;
			if (newStatus === CarStatus.SOLD) $set.soldAt = new Date();
			if (newStatus === CarStatus.DELETE) $set.deletedAt = new Date();
		}

		// only if nobody changed the car's status meanwhile: two parallel deletes can't both lower memberCars
		const updated = await this.carModel
			.findOneAndUpdate({ _id: carId, memberId, carStatus: car.carStatus }, { $set, $unset }, { new: true })
			.lean<Car>()
			.exec();
		if (!updated) throw new BadRequestException(Message.UPDATE_FAILED);

		if (newStatus === CarStatus.DELETE) {
			await this.memberModel.updateOne({ _id: memberId }, { $inc: { memberCars: -1 } });
		}
		// TODO(test-drive module): SOLD / DELETE -> open test drives CANCEL (+ notify those buyers on SOLD)
		return updated;
	}

	/** the same rules as createCar: run CarInput's validators on a whole car */
	private async assertValidListing(car: Record<string, unknown>): Promise<void> {
		const errors = await validate(plainToInstance(CarInput, car));
		if (errors.length) {
			const message = Object.values(errors[0].constraints ?? {})[0] ?? Message.UPDATE_FAILED;
			throw new BadRequestException(message);
		}
	}

	/**
	 * Car detail (Search & Engage flowchart). Who sees what:
	 * - ACTIVE, SOLD: everyone (SOLD so old links and liked cars show a "sold" page)
	 * - HOLD: only the owning agent and admins
	 * - DELETE: only admins
	 * Views: logged-in viewers, once per car, never the owner, only while the car is ACTIVE.
	 */
	public async getCar(carId: Types.ObjectId, viewer: AuthMemberData | null): Promise<Car> {
		const car = await this.carModel.findById(carId).lean<Car>().exec();
		const isAdmin = viewer?.memberType === MemberType.ADMIN;
		const isOwner = !!car && !!viewer && String(car.memberId) === String(viewer._id);
		const visible =
			!!car &&
			(car.carStatus === CarStatus.ACTIVE ||
				car.carStatus === CarStatus.SOLD ||
				(car.carStatus === CarStatus.HOLD && isOwner) ||
				isAdmin);
		// "not found" for hidden cars too: don't reveal that a held / deleted car exists
		if (!car || !visible) throw new NotFoundException(Message.NO_DATA_FOUND);

		if (viewer && !isOwner && car.carStatus === CarStatus.ACTIVE) {
			const isNewView = await this.viewService.recordView({
				memberId: viewer._id,
				viewRefId: carId,
				viewGroup: ViewGroup.CAR,
			});
			if (isNewView) {
				await this.carModel.updateOne({ _id: carId }, { $inc: { carViews: 1 } }).exec();
				car.carViews += 1;
			}
		}

		// agent contact buttons on the car page. A plain read: no profile view is counted for the agent
		const agent = await this.memberModel.findById(car.memberId).select(AGENT_PUBLIC_FIELDS).lean<AgentPublic>().exec();
		const meLiked = viewer
			? await this.likeService.checkLikeExistence({ memberId: viewer._id, likeRefId: carId, likeGroup: LikeGroup.CAR })
			: undefined;
		return { ...car, agentData: agent ?? undefined, meLiked };
	}

	/**
	 * Like / un-like a car (toggle), Search & Engage flowchart: ACTIVE cars only, the dealer's PERSONAL
	 * block stops the blocked member, carLikes follows the real likes, and the dealer gets ONE
	 * LIKE notification per liker. Dealers can't like their own cars.
	 */
	public async likeTargetCar(memberId: Types.ObjectId, carId: Types.ObjectId): Promise<Car> {
		const car = await this.carModel
			.findOne({ _id: carId, carStatus: CarStatus.ACTIVE })
			.select('memberId carTitle')
			.lean<Car>()
			.exec();
		if (!car) throw new NotFoundException(Message.NO_DATA_FOUND);
		const ownerId = new Types.ObjectId(String(car.memberId));
		if (ownerId.equals(memberId)) throw new BadRequestException(Message.OWN_CONTENT_LIKE_DENIED);
		if (await this.blockModel.exists({ blockerId: ownerId, blockedId: memberId })) {
			throw new ForbiddenException(Message.LIKE_BLOCKED);
		}

		const modifier = await this.likeService.toggleLike({ memberId, likeRefId: carId, likeGroup: LikeGroup.CAR });
		const updated = await this.carModel
			.findByIdAndUpdate(carId, { $inc: { carLikes: modifier } }, { new: true })
			.lean<Car>()
			.exec();
		if (!updated) throw new NotFoundException(Message.NO_DATA_FOUND);

		if (modifier === 1) {
			await this.notificationService.notifyOnce({
				notificationType: NotificationType.LIKE,
				notificationGroup: NotificationGroup.CAR,
				notificationTitle: `Someone liked your car "${car.carTitle}"`,
				authorId: memberId,
				receiverId: ownerId,
				carId,
			});
		}
		const agent = await this.memberModel.findById(ownerId).select(AGENT_PUBLIC_FIELDS).lean<AgentPublic>().exec();
		return { ...updated, agentData: agent ?? undefined };
	}

	/**
	 * Public car search (Search, Filter, Sort & Engage flowchart): ACTIVE cars, filters + sort + cursor
	 * pagination, all in MongoDB (libs/utils/car-query.ts). Each car comes with its agent's PUBLIC data.
	 * "load more" = send nextCursor back as cursor. No match = an empty list, not an error.
	 */
	/** "My favorites": the cars this member liked (LikeService builds the list from the likes) */
	public async getFavorites(memberId: Types.ObjectId, input: OrdinaryInquiry): Promise<CarsPage> {
		return this.likeService.getFavoriteCars(memberId, input);
	}

	/** "Recently viewed": the cars this member opened (ViewService builds the list from the views) */
	public async getVisited(memberId: Types.ObjectId, input: OrdinaryInquiry): Promise<CarsPage> {
		return this.viewService.getVisitedCars(memberId, input);
	}

	public async getCars(input: CarsInquiry, viewer: AuthMemberData | null): Promise<Cars> {
		const docs = await this.carModel.aggregate<Car>(buildCarsPipeline(input, viewer?._id)).exec();
		return toPage(docs, input);
	}

	/**
	 * "My cars" dashboard: only the logged-in agent's cars (memberId from the JWT), ACTIVE + HOLD + SOLD
	 * or one of them. DELETE is never listed. Page numbers + total, for tabs like "Paused (3)".
	 */
	public async getAgentCars(memberId: Types.ObjectId, input: AgentCarsInquiry): Promise<CarsPage> {
		const status = input.search?.carStatus;
		const match = { memberId, carStatus: status ?? { $ne: CarStatus.DELETE } };
		const direction = input.direction ?? Direction.DESC;
		// _id breaks ties (same price / views), so a car never shows up on two pages or on none
		const sort: Record<string, Direction> = { [input.sort ?? CarSort.CREATED_AT]: direction, _id: direction };

		const [result] = await this.carModel
			.aggregate<CarsPage>([
				{ $match: match },
				{ $sort: sort },
				{
					$facet: {
						list: [{ $skip: (input.page - 1) * input.limit }, { $limit: input.limit }],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();
		return result ?? { list: [], metaCounter: [] };
	}

	/** ADMIN: every car in any status (Admin flowchart, "Cars" section), with the agent's public data */
	public async getAllCarsByAdmin(input: AllCarsInquiry): Promise<CarsPage> {
		const { carStatus, locationList, agentId } = input.search ?? {};
		const match: Record<string, unknown> = {};
		if (carStatus) match.carStatus = carStatus;
		if (locationList?.length) match.carLocation = { $in: locationList };
		if (agentId) match.memberId = shapeIntoMongoObjectId(agentId);
		const direction = input.direction ?? Direction.DESC;
		const sort: Record<string, Direction> = { [input.sort ?? CarSort.CREATED_AT]: direction, _id: direction };

		const [result] = await this.carModel
			.aggregate<CarsPage>([
				{ $match: match },
				{ $sort: sort },
				{
					$facet: {
						list: [{ $skip: (input.page - 1) * input.limit }, { $limit: input.limit }, ...lookupAgentData],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();
		return result ?? { list: [], metaCounter: [] };
	}

	/**
	 * ADMIN moderation of any car. memberCars counts every car that is not DELETE,
	 * so DELETE lowers it and restoring a deleted car raises it again.
	 */
	public async updateCarByAdmin(input: CarUpdateByAdmin): Promise<Car> {
		const carId = shapeIntoMongoObjectId(input._id);
		const car = await this.carModel.findById(carId).lean<Car>().exec();
		if (!car) throw new NotFoundException(Message.NO_DATA_FOUND);

		const $set: Record<string, unknown> = { carStatus: input.carStatus };
		const $unset: Record<string, ''> = {};
		switch (input.carStatus) {
			case CarStatus.HOLD:
				if (car.carStatus === CarStatus.SOLD || car.carStatus === CarStatus.DELETE) {
					throw new BadRequestException(Message.CAR_HOLD_ONLY_LISTED);
				}
				$set.carHoldReason = input.carHoldReason;
				break;
			case CarStatus.ACTIVE:
				if (car.carStatus === CarStatus.SOLD) throw new BadRequestException(Message.CAR_SOLD_FINAL);
				$unset.carHoldReason = '';
				$unset.deletedAt = '';
				break;
			case CarStatus.DELETE:
				if (car.carStatus === CarStatus.DELETE) throw new BadRequestException(Message.NOTHING_TO_UPDATE);
				$set.deletedAt = new Date();
				break;
		}
		if (car.carStatus === input.carStatus && input.carStatus === CarStatus.ACTIVE) {
			throw new BadRequestException(Message.NOTHING_TO_UPDATE);
		}

		// only if the status didn't change meanwhile: the counter below can't run twice
		const updated = await this.carModel
			.findOneAndUpdate({ _id: carId, carStatus: car.carStatus }, { $set, $unset }, { new: true })
			.lean<Car>()
			.exec();
		if (!updated) throw new BadRequestException(Message.UPDATE_FAILED);

		const wasDeleted = car.carStatus === CarStatus.DELETE;
		const isDeleted = input.carStatus === CarStatus.DELETE;
		if (wasDeleted !== isDeleted) {
			await this.memberModel.updateOne({ _id: car.memberId }, { $inc: { memberCars: isDeleted ? -1 : 1 } });
		}
		// TODO(notification module): tell the dealer their car was held / deleted / restored
		// TODO(test-drive module): HOLD / DELETE -> open test drives CANCEL
		return updated;
	}

	/**
	 * ADMIN: remove a car FOR GOOD (spam, illegal listing). Step 2 after updateCarByAdmin DELETE:
	 * only an already-deleted car can be removed, so nothing disappears by one wrong click.
	 * memberCars already went down at the delete. Its photos and view records are removed with it.
	 */
	public async removeCarByAdmin(carId: Types.ObjectId): Promise<Car> {
		const removed = await this.carModel
			.findOneAndDelete({ _id: carId, carStatus: CarStatus.DELETE })
			.lean<Car>()
			.exec();
		if (!removed) {
			const exists = await this.carModel.exists({ _id: carId });
			if (exists) throw new BadRequestException(Message.CAR_REMOVE_ONLY_DELETED);
			throw new NotFoundException(Message.NO_DATA_FOUND);
		}

		await Promise.all([
			this.uploadService.removeImages(removed.carImages, UploadTarget.CAR),
			this.viewService.removeViews(carId),
		]);
		// TODO(like / comment / test-drive / notification modules): remove their records of this car too
		return removed;
	}

	/**
	 * Admin blocked the agent: hide their ACTIVE cars from search. HOLD keeps memberCars unchanged
	 * (Car Listing flowchart). After an unblock the agent re-activates the cars they still want to sell.
	 * Returns how many cars were put on HOLD.
	 */
	public async holdAgentCars(memberId: Types.ObjectId): Promise<number> {
		const result = await this.carModel.updateMany(
			{ memberId, carStatus: CarStatus.ACTIVE },
			{ $set: { carStatus: CarStatus.HOLD } },
		);
		// TODO(test-drive module): open test drives of these cars -> CANCEL
		return result.modifiedCount;
	}

	/**
	 * Admin deleted the agent: their listings (ACTIVE / HOLD) are deleted too and memberCars goes down
	 * by the same number. SOLD cars stay as sales history. Returns how many cars were deleted.
	 */
	public async deleteAgentCars(memberId: Types.ObjectId): Promise<number> {
		const result = await this.carModel.updateMany(
			{ memberId, carStatus: { $in: [CarStatus.ACTIVE, CarStatus.HOLD] } },
			{ $set: { carStatus: CarStatus.DELETE, deletedAt: new Date() } },
		);
		if (result.modifiedCount) {
			await this.memberModel.updateOne({ _id: memberId }, { $inc: { memberCars: -result.modifiedCount } });
		}
		// TODO(test-drive module): open test drives of these cars -> CANCEL
		return result.modifiedCount;
	}
}
