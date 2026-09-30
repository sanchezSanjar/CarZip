import { Schema } from 'mongoose';
import { CommentGroup, CommentStatus } from '../libs/enums/comment.enum';

const CommentSchema = new Schema(
	{
		commentStatus: { type: String, enum: CommentStatus, default: CommentStatus.ACTIVE },
		commentGroup: { type: String, enum: CommentGroup, required: true },
		commentContent: { type: String, required: true },
		commentRefId: { type: Schema.Types.ObjectId, required: true }, // car, article or member _id depending on commentGroup
		memberId: { type: Schema.Types.ObjectId, required: true, ref: 'Member' },
	},
	{ timestamps: true, collection: 'comments' },
);

CommentSchema.index({ commentRefId: 1, commentStatus: 1, createdAt: -1 });

export default CommentSchema;
