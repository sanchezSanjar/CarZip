import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { View } from '../../libs/dto/view/view';
import { ViewInput } from '../../libs/dto/view/view.input';
import { CarsPage } from '../../libs/dto/car/car';
import { OrdinaryInquiry } from '../../libs/dto/car/car.input';
import { ViewGroup } from '@app/common/enums/view.enum';
import { refsToCarsPage } from '../../libs/utils/car-query';

@Injectable()
export class ViewService {
	constructor(@InjectModel('View') private readonly viewModel: Model<View>) {}

	/**
	 * Records "member viewed this item". Returns true only the FIRST time, so the caller
	 * increases the counter (memberViews, carViews) once per member, not on every page refresh.
	 * One atomic upsert instead of "find, then insert": two requests at the same moment
	 * (double click, two tabs) can't both count, and can't crash on the unique index.
	 */
	public async recordView(input: ViewInput): Promise<boolean> {
		const { memberId, viewRefId, viewGroup } = input;
		const result = await this.viewModel
			.updateOne({ memberId, viewRefId }, { $setOnInsert: { memberId, viewRefId, viewGroup } }, { upsert: true })
			.exec();
		return result.upsertedCount === 1;
	}

	/**
	 * "Recently viewed": the cars the member opened, the latest visit first.
	 * recordView's upsert also refreshes updatedAt (Mongoose timestamps) on every later visit,
	 * so a car viewed again moves back to the top.
	 */
	public async getVisitedCars(memberId: Types.ObjectId, input: OrdinaryInquiry): Promise<CarsPage> {
		const [result] = await this.viewModel
			.aggregate<CarsPage>([
				{ $match: { memberId, viewGroup: ViewGroup.CAR } },
				{ $sort: { updatedAt: -1, _id: -1 } },
				...refsToCarsPage('viewRefId', memberId, input),
			])
			.exec();
		return result ?? { list: [], metaCounter: [] };
	}

	/** the item itself is gone for good (car / article removed permanently): its view records go too */
	public async removeViews(viewRefId: Types.ObjectId): Promise<number> {
		return (await this.viewModel.deleteMany({ viewRefId }).exec()).deletedCount;
	}
}
