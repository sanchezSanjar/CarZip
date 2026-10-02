import { Schema } from 'mongoose';
import { NotificationGroup, NotificationStatus, NotificationType } from '../libs/enums/notification.enum';

const NotificationSchema = new Schema(
	{
		notificationType: { type: String, enum: NotificationType, required: true },
		notificationStatus: { type: String, enum: NotificationStatus, default: NotificationStatus.WAIT },
		notificationGroup: { type: String, enum: NotificationGroup, required: true },
		notificationTitle: { type: String, required: true },
		notificationDesc: { type: String },
		authorId: { type: Schema.Types.ObjectId, required: true, ref: 'Member' },
		receiverId: { type: Schema.Types.ObjectId, required: true, ref: 'Member' },
		// a notification is about a car OR an article, never both
		carId: { type: Schema.Types.ObjectId, ref: 'Car' },
		articleId: { type: Schema.Types.ObjectId, ref: 'BoardArticle' },
	},
	{ timestamps: true, collection: 'notifications' },
);

NotificationSchema.index({ receiverId: 1, notificationStatus: 1, createdAt: -1 });
// MongoDB deletes old notifications by itself (TTL, checked about once a minute):
// a READ one 90 days after it was read (updatedAt), any one a year after it was created
NotificationSchema.index(
	{ updatedAt: 1 },
	{
		expireAfterSeconds: 90 * 24 * 60 * 60,
		partialFilterExpression: { notificationStatus: NotificationStatus.READ },
		name: 'ttl_read_notifications',
	},
);
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60, name: 'ttl_all_notifications' });
// one LIKE notification per liker per item, even with parallel requests (NotificationService.notifyOnce).
// Member likes have no carId / articleId: missing fields count as null, so they are unique per author + receiver.
NotificationSchema.index(
	{ notificationType: 1, authorId: 1, receiverId: 1, carId: 1, articleId: 1 },
	{ unique: true, partialFilterExpression: { notificationType: NotificationType.LIKE } },
);
// one FOLLOW notification per follower per agent: follow -> unfollow -> follow does not notify again
NotificationSchema.index(
	{ notificationType: 1, authorId: 1, receiverId: 1 },
	{
		unique: true,
		partialFilterExpression: { notificationType: NotificationType.FOLLOW },
		name: 'unique_follow_notification',
	},
);

export default NotificationSchema;
