import { UseGuards } from '@nestjs/common';
import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Types } from 'mongoose';
import { NotificationService } from './notification.service';
import { Notifications } from '../../libs/dto/notification/notification';
import { NotificationsInquiry, NotificationsRead } from '../../libs/dto/notification/notification.input';
import { AuthGuard } from '../auth/guards/auth.guard';
import { AuthMember } from '../auth/decorators/authMember.decorator';

/** the bell: every logged-in member sees and reads only their OWN notifications (receiverId from the JWT) */
@Resolver()
export class NotificationResolver {
	constructor(private readonly notificationService: NotificationService) {}

	@UseGuards(AuthGuard)
	@Query(() => Notifications)
	public async getNotifications(
		@Args('input') input: NotificationsInquiry,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Notifications> {
		return this.notificationService.getNotifications(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Query(() => Int)
	public async getUnreadNotificationCount(@AuthMember('_id') memberId: Types.ObjectId): Promise<number> {
		return this.notificationService.countUnread(memberId);
	}

	/** returns how many notifications became READ */
	@UseGuards(AuthGuard)
	@Mutation(() => Int)
	public async markNotificationsRead(
		@Args('input') input: NotificationsRead,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<number> {
		return this.notificationService.markRead(memberId, input.notificationIds);
	}
}
