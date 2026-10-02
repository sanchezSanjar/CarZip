import { Field, ObjectType } from '@nestjs/graphql';
import { AgentPublic } from '../car/car';
import { TotalCounter } from '../member/member';
import { NotificationGroup, NotificationStatus, NotificationType } from '@app/common/enums/notification.enum';

@ObjectType()
export class Notification {
	@Field(() => String) _id: string;
	@Field(() => NotificationType) notificationType: NotificationType;
	@Field(() => NotificationStatus) notificationStatus: NotificationStatus;
	@Field(() => NotificationGroup) notificationGroup: NotificationGroup;
	@Field(() => String) notificationTitle: string;
	@Field(() => String, { nullable: true }) notificationDesc?: string;
	@Field(() => String) authorId: string;
	@Field(() => String) receiverId: string;
	/** what it is about: open this car / article when the notification is tapped */
	@Field(() => String, { nullable: true }) carId?: string;
	@Field(() => String, { nullable: true }) articleId?: string;
	@Field(() => Date) createdAt: Date;
	@Field(() => Date) updatedAt: Date;

	/** who caused it (liker, commenter, dealer, admin...): PUBLIC fields only */
	@Field(() => AgentPublic, { nullable: true }) authorData?: AgentPublic;
}

/** a page of notifications. metaCounter[0].total = how many match in total */
@ObjectType()
export class Notifications {
	@Field(() => [Notification]) list: Notification[];
	@Field(() => [TotalCounter], { nullable: true }) metaCounter?: TotalCounter[];
}
