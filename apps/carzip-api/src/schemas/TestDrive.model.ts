import { Schema } from 'mongoose';
import { TestDriveStatus } from '../libs/enums/test-drive.enum';

const TestDriveSchema = new Schema(
	{
		testDriveStatus: { type: String, enum: TestDriveStatus, default: TestDriveStatus.REQUEST },
		testDriveDate: { type: Date, required: true },
		testDriveMessage: { type: String },
		carId: { type: Schema.Types.ObjectId, required: true, ref: 'Car' },
		memberId: { type: Schema.Types.ObjectId, required: true, ref: 'Member' }, // requester (buyer)
		sellerId: { type: Schema.Types.ObjectId, required: true, ref: 'Member' }, // copied from car.memberId
	},
	{ timestamps: true, collection: 'testDrives' },
);

// seller's inbox: "requests waiting for me"
TestDriveSchema.index({ sellerId: 1, testDriveStatus: 1, testDriveDate: 1 });
// buyer's list: "my requests"
TestDriveSchema.index({ memberId: 1, createdAt: -1 });
// a buyer can have only ONE open request per car
TestDriveSchema.index(
	{ carId: 1, memberId: 1 },
	{ unique: true, partialFilterExpression: { testDriveStatus: TestDriveStatus.REQUEST } },
);

export default TestDriveSchema;
