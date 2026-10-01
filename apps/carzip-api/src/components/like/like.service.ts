import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Like } from '../../libs/dto/like/like';

/**
 * Likes for cars, articles and members. Used by those modules (likeTargetCar / Article / Member)
 * and for "did I like this?" (MeLiked). One like per member per item: unique index in Like.model.ts.
 */
@Injectable()
export class LikeService {
	constructor(@InjectModel('Like') private readonly likeModel: Model<Like>) {}
}
