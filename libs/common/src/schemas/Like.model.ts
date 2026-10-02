import { Schema } from 'mongoose';
import { LikeGroup } from '../enums/like.enum';

const LikeSchema = new Schema(
	{
		likeGroup: { type: String, enum: LikeGroup, required: true },
		likeRefId: { type: Schema.Types.ObjectId, required: true },
		memberId: { type: Schema.Types.ObjectId, required: true, ref: 'Member' },
	},
	{ timestamps: true, collection: 'likes' },
);

// one member can like one thing only once
LikeSchema.index({ memberId: 1, likeRefId: 1 }, { unique: true });

export default LikeSchema;
