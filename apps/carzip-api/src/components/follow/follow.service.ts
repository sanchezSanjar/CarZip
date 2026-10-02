import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Follower } from '../../libs/dto/follow/follow';
import { Member } from '../../libs/dto/member/member';
import { NotificationService } from '../notification/notification.service';

/**
 * Following (the user's rule): only ACTIVE AGENTs can be followed; any logged-in USER, AGENT or ADMIN
 * can follow an agent; guests can't; nobody follows themselves. The agent's PERSONAL block applies.
 */
@Injectable()
export class FollowService {
	constructor(
		@InjectModel('Follow') private readonly followModel: Model<Follower>,
		@InjectModel('Member') private readonly memberModel: Model<Member>, // target check + memberFollowers / memberFollowings
		@InjectModel('Block') private readonly blockModel: Model<{ blockerId: unknown; blockedId: unknown }>,
		private readonly notificationService: NotificationService,
	) {}
}
