import { Schema } from 'mongoose';
import { MessageType, PRIVATE_MESSAGE_TTL_DAYS } from '../enums/conversation.enum';

/** one private message in a conversation. MongoDB deletes it 14 days after it was sent */
const PrivateMessageSchema = new Schema(
	{
		conversationId: { type: Schema.Types.ObjectId, required: true, ref: 'Conversation' },
		senderId: { type: Schema.Types.ObjectId, required: true, ref: 'Member' },
		messageType: { type: String, enum: MessageType, default: MessageType.TEXT },
		messageText: { type: String }, // the text, or the caption of a photo
		messageImage: { type: String }, // IMAGE: an upload of target chat
		messageAudio: { type: String }, // VOICE: POST /upload/voice
		messageDuration: { type: Number }, // VOICE: seconds, as the app recorded it
		carId: { type: Schema.Types.ObjectId, ref: 'Car' }, // "about this car": shown as a small car card
	},
	{ timestamps: { createdAt: true, updatedAt: false }, collection: 'privateMessages' },
);

// the thread, newest first, page by page
PrivateMessageSchema.index({ conversationId: 1, createdAt: -1 });
// the spam limit: how many messages did this member send in the last minute?
PrivateMessageSchema.index({ senderId: 1, createdAt: -1 });
PrivateMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: PRIVATE_MESSAGE_TTL_DAYS * 24 * 60 * 60 });

export default PrivateMessageSchema;
