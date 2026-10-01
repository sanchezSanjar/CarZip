import { Field, InputType, Int } from '@nestjs/graphql';
import {
	ArrayMaxSize,
	IsNotEmpty,
	ValidateIf,
	ArrayMinSize,
	IsBoolean,
	IsIn,
	IsInt,
	IsMongoId,
	IsNumber,
	IsOptional,
	IsString,
	IsUrl,
	Length,
	Max,
	Min,
} from 'class-validator';
import {
	CarBrand,
	CarColor,
	CarCondition,
	CarFuelType,
	CarLocation,
	CarMarket,
	CarOption,
	CarStatus,
	CarTransmission,
	CarType,
} from '../../enums/car.enum';

/**
 * updateCar input (Car Listing flowchart: "Agent action, own cars only").
 * Every field is optional and only checked on its own here. Rules BETWEEN fields (model ∈ brand,
 * prices vs market, export agreement, no rent on export-only) are checked by CarService on the car
 * AFTER the change, with the same CarInput rules as createCar.
 */
@InputType()
export class CarUpdate {
	@IsMongoId()
	@Field(() => String)
	_id: string;

	/** ACTIVE <-> HOLD (pause / re-activate), SOLD (soldAt), DELETE (deletedAt, memberCars -1). SOLD and DELETE are final. */
	@IsOptional()
	@IsIn([CarStatus.ACTIVE, CarStatus.HOLD, CarStatus.SOLD, CarStatus.DELETE])
	@Field(() => CarStatus, { nullable: true })
	carStatus?: CarStatus;

	@IsOptional()
	@IsIn(Object.values(CarType))
	@Field(() => CarType, { nullable: true })
	carType?: CarType;

	@IsOptional()
	@IsIn(Object.values(CarBrand))
	@Field(() => CarBrand, { nullable: true })
	carBrand?: CarBrand;

	@IsOptional()
	@IsString()
	@Field(() => String, { nullable: true })
	carModel?: string;

	@IsOptional()
	@IsInt()
	@Field(() => Int, { nullable: true })
	carYear?: number;

	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(2_000_000)
	@Field(() => Int, { nullable: true })
	carMileage?: number;

	@IsOptional()
	@IsIn(Object.values(CarColor))
	@Field(() => CarColor, { nullable: true })
	carColor?: CarColor;

	@IsOptional()
	@IsIn(Object.values(CarCondition))
	@Field(() => CarCondition, { nullable: true })
	carCondition?: CarCondition;

	@IsOptional()
	@IsIn(Object.values(CarFuelType))
	@Field(() => CarFuelType, { nullable: true })
	carFuelType?: CarFuelType;

	@IsOptional()
	@IsIn(Object.values(CarTransmission))
	@Field(() => CarTransmission, { nullable: true })
	carTransmission?: CarTransmission;

	@IsOptional()
	@IsIn(Object.values(CarLocation))
	@Field(() => CarLocation, { nullable: true })
	carLocation?: CarLocation;

	@IsOptional()
	@Length(3, 150)
	@Field(() => String, { nullable: true })
	carAddress?: string;

	@IsOptional()
	@Length(5, 100)
	@Field(() => String, { nullable: true })
	carTitle?: string;

	@IsOptional()
	@IsIn(Object.values(CarMarket))
	@Field(() => CarMarket, { nullable: true })
	carMarket?: CarMarket;

	@IsOptional()
	@IsNumber()
	@Field(() => Number, { nullable: true })
	carPrice?: number;

	@IsOptional()
	@IsNumber()
	@Field(() => Number, { nullable: true })
	carPriceUsd?: number;

	/** needed when switching a DOMESTIC car to EXPORT / BOTH (the dealer accepts export responsibility) */
	@IsOptional()
	@IsBoolean()
	@Field(() => Boolean, { nullable: true })
	exportAgreed?: boolean;

	@IsOptional()
	@IsBoolean()
	@Field(() => Boolean, { nullable: true })
	carRent?: boolean;

	@IsOptional()
	@IsNumber()
	@Field(() => Number, { nullable: true })
	carRentPrice?: number;

	@IsOptional()
	@IsBoolean()
	@Field(() => Boolean, { nullable: true })
	carBarter?: boolean;

	@IsOptional()
	@IsBoolean()
	@Field(() => Boolean, { nullable: true })
	carTestDrive?: boolean;

	@IsOptional()
	@ArrayMinSize(1)
	@ArrayMaxSize(20)
	@IsUrl({ require_tld: false, require_protocol: true, protocols: ['http', 'https'] }, { each: true })
	@Field(() => [String], { nullable: true })
	carImages?: string[];

	@IsOptional()
	@Length(0, 3000)
	@Field(() => String, { nullable: true })
	carDesc?: string;

	@IsOptional()
	@IsIn(Object.values(CarOption), { each: true })
	@Field(() => [CarOption], { nullable: true })
	carOptions?: CarOption[];
}

/**
 * updateCarByAdmin input: moderation only (Admin flowchart "Cars": HOLD / DELETE, Car Listing: "ADMIN can HOLD / DELETE any car").
 * - HOLD: hide the car, carHoldReason required. The dealer sees the reason and can't re-activate it themself
 * - ACTIVE: lift an admin hold, or restore a deleted car
 * - DELETE: remove the car (deletedAt, memberCars -1)
 * Admins never edit a dealer's listing (title, prices...).
 */
@InputType()
export class CarUpdateByAdmin {
	@IsMongoId()
	@Field(() => String)
	_id: string;

	@IsIn([CarStatus.ACTIVE, CarStatus.HOLD, CarStatus.DELETE])
	@Field(() => CarStatus)
	carStatus: CarStatus;

	@ValidateIf((o: CarUpdateByAdmin) => o.carStatus === CarStatus.HOLD)
	@Length(5, 300)
	@IsNotEmpty({ message: 'Tell the dealer why the car is on hold' })
	@Field(() => String, { nullable: true })
	carHoldReason?: string;
}
