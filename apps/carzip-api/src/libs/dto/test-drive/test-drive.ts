import { Field, Int, ObjectType } from '@nestjs/graphql';
import { AgentPublic } from '../car/car';
import { TotalCounter } from '../member/member';
import { CarBrand, CarStatus } from '../../enums/car.enum';
import { TestDriveStatus } from '../../enums/test-drive.enum';

/** the car of a test drive: enough for a list row */
@ObjectType()
export class TestDriveCar {
	@Field(() => String) _id: string;
	@Field(() => String) carTitle: string;
	@Field(() => CarBrand) carBrand: CarBrand;
	@Field(() => String) carModel: string;
	@Field(() => Int) carYear: number;
	@Field(() => CarStatus) carStatus: CarStatus;
	@Field(() => [String]) carImages: string[];
}

/**
 * The buyer, as the DEALER of this test drive sees them. memberPhone (verified) is filled only after the
 * dealer CONFIRMed (and stays after COMPLETE): a dealer who rejects never gets the buyer's number.
 */
@ObjectType()
export class TestDriveBuyer {
	@Field(() => String) _id: string;
	@Field(() => String) memberNick: string;
	@Field(() => String, { nullable: true }) memberImage?: string;
	@Field(() => String, { nullable: true }) memberPhone?: string;
}

@ObjectType()
export class TestDrive {
	@Field(() => String) _id: string;
	@Field(() => TestDriveStatus) testDriveStatus: TestDriveStatus;
	@Field(() => Date) testDriveDate: Date;
	@Field(() => String, { nullable: true }) testDriveMessage?: string;
	@Field(() => String) carId: string;
	@Field(() => String) memberId: string; // buyer
	@Field(() => String) sellerId: string; // dealer
	@Field(() => Date) createdAt: Date;
	@Field(() => Date) updatedAt: Date;

	/** from aggregation */
	@Field(() => TestDriveCar, { nullable: true }) carData?: TestDriveCar;
	/** the buyer's view: the dealer's public profile and contacts */
	@Field(() => AgentPublic, { nullable: true }) sellerData?: AgentPublic;
	/** the dealer's view: the buyer (phone only after CONFIRM) */
	@Field(() => TestDriveBuyer, { nullable: true }) buyerData?: TestDriveBuyer;
}

/** a page of test drives. metaCounter[0].total = how many in total */
@ObjectType()
export class TestDrives {
	@Field(() => [TestDrive]) list: TestDrive[];
	@Field(() => [TotalCounter], { nullable: true }) metaCounter?: TotalCounter[];
}
