import { Schema } from 'mongoose';
import { TestDriveStatus } from '../enums/test-drive.enum';

const TestDriveSchema = new Schema(
	{
		testDriveStatus: { type: String, enum: TestDriveStatus, default: TestDriveStatus.REQUEST },
		testDriveDate: { type: Date, required: true },
		testDriveMessage: { type: String },
		carId: { type: Schema.Types.ObjectId, required: true, ref: 'Car' },
		memberId: { type: Schema.Types.ObjectId, required: true, ref: 'Member' }, // requester (buyer)
		sellerId: { type: Schema.Types.ObjectId, required: true, ref: 'Member' }, // copied from car.memberId
		// set by the batch server so each message goes out once, even if a job runs twice
		remindedAt: { type: Date }, // 'your test drive is coming up' sent to both sides
		followUpAt: { type: Date }, // 'did it happen? mark it complete or cancel it' sent to the dealer
	},
	{ timestamps: true, collection: 'testDrives' },
);

// seller's inbox: "requests waiting for me"
TestDriveSchema.index({ sellerId: 1, testDriveStatus: 1, testDriveDate: 1 });
// buyer's list: "my requests"
TestDriveSchema.index({ memberId: 1, createdAt: -1 });
// batch jobs: open test drives by status and date (expire, remind, follow up)
TestDriveSchema.index({ testDriveStatus: 1, testDriveDate: 1 });
// a car stops being on sale (SOLD / DELETE / HOLD): find its open test drives to cancel them
TestDriveSchema.index({ carId: 1, testDriveStatus: 1 });
// a buyer can have only ONE open request per car
TestDriveSchema.index(
	{ carId: 1, memberId: 1 },
	{ unique: true, partialFilterExpression: { testDriveStatus: TestDriveStatus.REQUEST } },
);

export default TestDriveSchema;
