import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { View } from '../../libs/dto/view/view';
import { ViewInput } from '../../libs/dto/view/view.input';

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
		const result = await this.viewModel.updateOne(
			{ memberId, viewRefId },
			{ $setOnInsert: { memberId, viewRefId, viewGroup } },
			{ upsert: true },
		);
		return result.upsertedCount === 1;
	}
}
