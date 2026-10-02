import { Schema } from 'mongoose';
import { ViewGroup } from '../enums/view.enum';

const ViewSchema = new Schema(
	{
		viewGroup: { type: String, enum: ViewGroup, required: true },
		viewRefId: { type: Schema.Types.ObjectId, required: true },
		memberId: { type: Schema.Types.ObjectId, required: true, ref: 'Member' },
	},
	{ timestamps: true, collection: 'views' },
);

// one view per member per item, so refreshing the page doesn't inflate carViews
ViewSchema.index({ memberId: 1, viewRefId: 1 }, { unique: true });
// "recently viewed" list: one member's views of one group, the latest first
ViewSchema.index({ memberId: 1, viewGroup: 1, updatedAt: -1 });

export default ViewSchema;
