import { Schema } from 'mongoose';

// PERSONAL block: blockedId can no longer comment on, like, or request test drives
// for anything owned by blockerId. It is never site-wide — only ADMIN blocks globally
// (members.memberStatus = BLOCK).
const BlockSchema = new Schema(
	{
		blockerId: { type: Schema.Types.ObjectId, required: true, ref: 'Member' }, // always an AGENT
		blockedId: { type: Schema.Types.ObjectId, required: true, ref: 'Member' }, // USER or AGENT
	},
	{ timestamps: true, collection: 'blocks' },
);

BlockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });

export default BlockSchema;
