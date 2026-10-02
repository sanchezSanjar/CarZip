import { Schema } from 'mongoose';

const FollowSchema = new Schema(
	{
		followingId: { type: Schema.Types.ObjectId, required: true, ref: 'Member' },
		followerId: { type: Schema.Types.ObjectId, required: true, ref: 'Member' },
	},
	{ timestamps: true, collection: 'follows' },
);

FollowSchema.index({ followingId: 1, followerId: 1 }, { unique: true });

export default FollowSchema;
