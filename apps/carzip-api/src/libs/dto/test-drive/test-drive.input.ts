import { Field, InputType, Int } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import { IsDate, IsIn, IsInt, IsMongoId, IsOptional, Length, Max, Min, ValidateNested } from 'class-validator';
import { availableTestDriveSorts } from '../../config';
import { Direction } from '../../enums/common.enum';
import { TestDriveStatus } from '../../enums/test-drive.enum';

/** requestTestDrive input. The buyer (memberId) comes from the JWT, the seller from the car in the DB. */
@InputType()
export class TestDriveInput {
	@IsMongoId()
	@Field(() => String)
	carId: string;

	/** when the buyer wants to come: ISO date-time, in the future (checked in the service) */
	@IsDate()
	@Field(() => Date)
	testDriveDate: Date;

	@IsOptional()
	@Length(1, 300)
	@Field(() => String, { nullable: true })
	testDriveMessage?: string;
}

/** updateTestDrive: the dealer confirms / rejects / completes, the buyer cancels */
@InputType()
export class TestDriveUpdate {
	@IsMongoId()
	@Field(() => String)
	_id: string;

	@IsIn([TestDriveStatus.CONFIRM, TestDriveStatus.REJECT, TestDriveStatus.COMPLETE, TestDriveStatus.CANCEL])
	@Field(() => TestDriveStatus)
	testDriveStatus: TestDriveStatus;
}

@InputType()
class TDISearch {
	@IsOptional()
	@IsIn(Object.values(TestDriveStatus))
	@Field(() => TestDriveStatus, { nullable: true })
	testDriveStatus?: TestDriveStatus;
}

/** getMyTestDrives (buyer) / getAgentTestDrives (dealer's inbox), page-based */
@InputType()
export class TestDrivesInquiry {
	@IsInt()
	@Min(1)
	@Field(() => Int)
	page: number;

	@IsInt()
	@Min(1)
	@Max(100)
	@Field(() => Int)
	limit: number;

	@IsOptional()
	@IsIn(availableTestDriveSorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@IsIn([Direction.ASC, Direction.DESC])
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsOptional()
	@ValidateNested() // without it nothing inside search is validated
	@Type(() => TDISearch)
	@Field(() => TDISearch, { nullable: true })
	search?: TDISearch;
}
