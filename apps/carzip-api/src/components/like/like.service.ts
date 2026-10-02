import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CarsPage } from '../../libs/dto/car/car';
import { OrdinaryInquiry } from '../../libs/dto/car/car.input';
import { CarStatus } from '../../libs/enums/car.enum';
import { LikeGroup } from '../../libs/enums/like.enum';
import { lookupAuthMemberLiked } from '../../libs/utils/lookup';
import { lookupAgentData } from '../../libs/utils/car-query';
import { Like, MeLiked } from '../../libs/dto/like/like';
import { LikeInput } from '../../libs/dto/like/like.input';

/**
 * Likes for cars, articles and members. Used by those modules (likeTargetCar / Article / Member)
 * and for "did I like this?" (MeLiked). One like per member per item: unique index in Like.model.ts.
 */
@Injectable()
export class LikeService {
	constructor(@InjectModel('Like') private readonly likeModel: Model<Like>) {}

	/**
	 * Like if not liked yet, un-like if liked. Returns how the item's like counter must change: +1, -1 or 0.
	 * Race-safe for double taps / two devices: removing is one atomic step, and if a parallel request
	 * already created the like, the unique index refuses ours and nothing changes (0).
	 */
	/** "did I like this?": [{ myFavorite: true }] if the member liked the item, [] if not */
	/**
	 * "My favorites": the cars the member liked, newest like first. Only cars people may see
	 * (ACTIVE, SOLD): held / deleted cars drop out of the list AND of the total.
	 * Each car comes with its agent's public data and meLiked (always liked here).
	 */
	public async getFavoriteCars(memberId: Types.ObjectId, input: OrdinaryInquiry): Promise<CarsPage> {
		const [result] = await this.likeModel
			.aggregate<CarsPage>([
				{ $match: { memberId, likeGroup: LikeGroup.CAR } },
				{ $sort: { updatedAt: -1, _id: -1 } },
				{
					$lookup: {
						from: 'cars',
						localField: 'likeRefId',
						foreignField: '_id',
						as: 'favoriteCar',
						pipeline: [{ $match: { carStatus: { $in: [CarStatus.ACTIVE, CarStatus.SOLD] } } }],
					},
				},
				{ $unwind: '$favoriteCar' }, // a held / deleted car: no match, the row disappears
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							{ $replaceRoot: { newRoot: '$favoriteCar' } },
							lookupAuthMemberLiked(memberId),
							...lookupAgentData,
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();
		return result ?? { list: [], metaCounter: [] };
	}

	public async checkLikeExistence(input: LikeInput): Promise<MeLiked[]> {
		const { memberId, likeRefId } = input;
		const liked = await this.likeModel.exists({ memberId, likeRefId });
		return liked ? [{ memberId: String(memberId), likeRefId: String(likeRefId), myFavorite: true }] : [];
	}

	public async toggleLike(input: LikeInput): Promise<1 | -1 | 0> {
		const { memberId, likeRefId } = input;
		if (await this.likeModel.findOneAndDelete({ memberId, likeRefId }).exec()) return -1;
		try {
			await this.likeModel.create(input);
			return 1;
		} catch (err: any) {
			if (err?.code === 11000) return 0; // liked meanwhile by a parallel request
			throw err;
		}
	}
}
