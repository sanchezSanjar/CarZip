import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Error as MongooseError, Model, Types } from 'mongoose';
import { Car } from '../../libs/dto/car/car';
import { CarInput } from '../../libs/dto/car/car.input';
import { Member } from '../../libs/dto/member/member';
import { CarMarket, CarStatus } from '../../libs/enums/car.enum';
import { UploadTarget } from '../../libs/enums/upload.enum';
import { Message } from '../../libs/enums/common.enum';
import { UploadService } from '../upload/upload.service';

@Injectable()
export class CarService {
	private readonly logger = new Logger('CarService');

	constructor(
		@InjectModel('Car') private readonly carModel: Model<Car>,
		@InjectModel('Member') private readonly memberModel: Model<Member>,
		private readonly uploadService: UploadService,
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
