import { Schema } from 'mongoose';
import { MessageType, PRIVATE_MESSAGE_TTL_DAYS } from '../enums/conversation.enum';

/**
 * A private conversation between one buyer (USER) and one dealer (AGENT): one per pair.
 * Keeps the last message for the list, and how many messages each side has not read yet.
 * Deleted by MongoDB 14 days after its last message, like the messages themselves.
 */
const ConversationSchema = new Schema(
	{
		buyerId: { type: Schema.Types.ObjectId, required: true, ref: 'Member' },
		agentId: { type: Schema.Types.ObjectId, required: true, ref: 'Member' },
		carId: { type: Schema.Types.ObjectId, ref: 'Car' }, // the car they last talked about
		lastMessageText: { type: String },
		lastMessageType: { type: String, enum: MessageType },
		lastSenderId: { type: Schema.Types.ObjectId, ref: 'Member' },
		lastMessageAt: { type: Date, required: true },
		buyerUnread: { type: Number, default: 0 },
		agentUnread: { type: Number, default: 0 },
		buyerReadAt: { type: Date }, // read receipts: messages before this time were seen by the buyer
		agentReadAt: { type: Date },
	},
	{ timestamps: true, collection: 'conversations' },
);

ConversationSchema.index({ buyerId: 1, agentId: 1 }, { unique: true });
// "my conversations", newest first, for either side
ConversationSchema.index({ buyerId: 1, lastMessageAt: -1 });
ConversationSchema.index({ agentId: 1, lastMessageAt: -1 });
ConversationSchema.index({ lastMessageAt: 1 }, { expireAfterSeconds: PRIVATE_MESSAGE_TTL_DAYS * 24 * 60 * 60 });

export default ConversationSchema;
