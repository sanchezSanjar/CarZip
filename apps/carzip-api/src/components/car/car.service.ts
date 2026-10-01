import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Car } from '../../libs/dto/car/car';
import { Member } from '../../libs/dto/member/member';
import { CarStatus } from '../../libs/enums/car.enum';

@Injectable()
export class CarService {
	constructor(
		@InjectModel('Car') private readonly carModel: Model<Car>,
		@InjectModel('Member') private readonly memberModel: Model<Member>,
	) {}

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
