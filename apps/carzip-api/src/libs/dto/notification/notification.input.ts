import { Field, InputType, Int } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
	ArrayMaxSize,
	ArrayMinSize,
	IsIn,
	IsInt,
	IsMongoId,
	IsOptional,
	Max,
	Min,
	ValidateNested,
} from 'class-validator';
import { NotificationGroup, NotificationStatus } from '@app/common/enums/notification.enum';

@InputType()
class NISearch {
	/** WAIT = unread only, READ = read only, none = all */
	@IsOptional()
	@IsIn(Object.values(NotificationStatus))
	@Field(() => NotificationStatus, { nullable: true })
	notificationStatus?: NotificationStatus;

	@IsOptional()
	@IsIn(Object.values(NotificationGroup))
	@Field(() => NotificationGroup, { nullable: true })
	notificationGroup?: NotificationGroup;
}

/** getNotifications: the logged-in member's own notifications, newest first, page-based */
@InputType()
export class NotificationsInquiry {
	@IsInt()
	@Min(1)
	@Field(() => Int)
	page: number;

	@IsInt()
	@Min(1)
	@Max(100)
	@Field(() => Int)
	limit: number;

	@IsOptional()
	@ValidateNested() // without it nothing inside search is validated
	@Type(() => NISearch)
	@Field(() => NISearch, { nullable: true })
	search?: NISearch;
}

/** markNotificationsRead: these notifications, or (no ids) every unread one */
@InputType()
export class NotificationsRead {
	@IsOptional()
	@ArrayMinSize(1)
	@ArrayMaxSize(100)
	@IsMongoId({ each: true })
	@Field(() => [String], { nullable: true })
	notificationIds?: string[];
}
