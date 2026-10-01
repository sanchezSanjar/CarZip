import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Comment } from '../../libs/dto/comment/comment';
import { Car } from '../../libs/dto/car/car';
import { BoardArticle } from '../../libs/dto/board-article/board-article';
import { Member } from '../../libs/dto/member/member';
import { NotificationService } from '../notification/notification.service';

/**
 * Comments on cars, articles and member profiles (Search & Engage flowchart):
 * the target must exist, an agent's PERSONAL block stops a member from commenting on that agent's things,
 * the target's comment counter changes, and the owner gets a COMMENT notification.
 */
@Injectable()
export class CommentService {
	constructor(
		@InjectModel('Comment') private readonly commentModel: Model<Comment>,
		@InjectModel('Car') private readonly carModel: Model<Car>, // target check + carComments
		@InjectModel('BoardArticle') private readonly boardArticleModel: Model<BoardArticle>, // target check + articleComments
		@InjectModel('Member') private readonly memberModel: Model<Member>, // target check + memberComments
		@InjectModel('Block') private readonly blockModel: Model<{ blockerId: unknown; blockedId: unknown }>, // personal blocks
		private readonly notificationService: NotificationService,
	) {}
}
