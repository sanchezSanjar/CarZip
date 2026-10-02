import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CarsPage } from '../../libs/dto/car/car';
import { OrdinaryInquiry } from '../../libs/dto/car/car.input';
import { LikeGroup } from '@app/common/enums/like.enum';
import { refsToCarsPage } from '../../libs/utils/car-query';
import { Like, MeLiked } from '../../libs/dto/like/like';
import { LikeInput } from '../../libs/dto/like/like.input';

/**
 * Likes for cars, articles and members. Used by those modules (likeTargetCar / Article / Member)
 * and for "did I like this?" (MeLiked). One like per member per item: unique index in Like.model.ts.
 */
@Injectable()
export class LikeService {
	constructor(@InjectModel('Like') private readonly likeModel: Model<Like>) {}

	/** "My favorites": the cars the member liked, the newest like first (see refsToCarsPage) */
	public async getFavoriteCars(memberId: Types.ObjectId, input: OrdinaryInquiry): Promise<CarsPage> {
		const [result] = await this.likeModel
			.aggregate<CarsPage>([
				{ $match: { memberId, likeGroup: LikeGroup.CAR } },
				{ $sort: { updatedAt: -1, _id: -1 } },
				...refsToCarsPage('likeRefId', memberId, input),
			])
			.exec();
		return result ?? { list: [], metaCounter: [] };
	}

	/** the item is removed for good: its likes go with it. Returns how many were removed */
	public async removeLikes(likeRefId: Types.ObjectId): Promise<number> {
		return (await this.likeModel.deleteMany({ likeRefId }).exec()).deletedCount;
	}

	/** "did I like this?": [{ myFavorite: true }] if the member liked the item, [] if not */
	public async checkLikeExistence(input: LikeInput): Promise<MeLiked[]> {
		const { memberId, likeRefId } = input;
		const liked = await this.likeModel.exists({ memberId, likeRefId }).exec();
		return liked ? [{ memberId: String(memberId), likeRefId: String(likeRefId), myFavorite: true }] : [];
	}

	/**
	 * Like if not liked yet, un-like if liked. Returns how the item's like counter must change: +1, -1 or 0.
	 * Race-safe for double taps / two devices: removing is one atomic step, and if a parallel request
	 * already created the like, the unique index refuses ours and nothing changes (0).
	 */
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
