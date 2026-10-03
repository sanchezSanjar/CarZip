import { Schema } from 'mongoose';

/**
 * One live-chat message. The sender's public profile is copied in as it was when the message was sent,
 * so loading the history needs no lookups (and shows what everyone saw at the time).
 * Only logged-in members send, so memberId is always set. Old messages are removed by the batch server.
 */
const ChatMessageSchema = new Schema(
	{
		chatText: { type: String, required: true, maxlength: 500 },
		memberId: { type: Schema.Types.ObjectId, required: true, ref: 'Member' },
		memberNick: { type: String, required: true },
		memberImage: { type: String },
		memberType: { type: String, required: true },
	},
	{ timestamps: { createdAt: true, updatedAt: false }, collection: 'chatMessages' },
);

// "the newest messages" (history on startup) and "older than N days" (nightly cleanup)
ChatMessageSchema.index({ createdAt: -1 });

export default ChatMessageSchema;
