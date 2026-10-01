import { Types } from 'mongoose';
import { NotificationGroup, NotificationType } from '../../enums/notification.enum';

/** server-side only: notifications are created by the system (approve, like, comment...), never by a client */
export interface NotificationInput {
	notificationType: NotificationType;
	notificationGroup: NotificationGroup;
	notificationTitle: string;
	notificationDesc?: string;
	authorId: Types.ObjectId; // who caused it (the admin, the new agent, the liker...)
	receiverId: Types.ObjectId;
	carId?: Types.ObjectId;
	articleId?: Types.ObjectId;
}
