import { Field, InputType, Int } from '@nestjs/graphql';
import {
	ArrayMaxSize,
	ArrayMinSize,
	Equals,
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
	ValidateIf,
	ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
	CarBrand,
	CarColor,
	CarCondition,
	CarFuelType,
	CarLocation,
	CarMarket,
	CarOption,
	CarSort,
	CarTransmission,
	CarType,
} from '../../enums/car.enum';
import { Direction } from '../../enums/common.enum';
import { CAR_YEAR_MIN, carYearMax, isValidModel } from '../../config/car-catalog';
import { Satisfies } from '../../validators/satisfies';

@InputType()
export class NumberRange {
	@IsOptional()
	@Min(0)
	@Field(() => Number, { nullable: true })
	start?: number;

	@IsOptional()
	@Min(0)
	@Field(() => Number, { nullable: true })
	end?: number;
}

/** Every filter is optional. Lists are OR inside one filter ("KIA or HYUNDAI"), filters are AND between each other. */
@InputType()
export class CarsSearch {
	@IsOptional()
	@IsMongoId()
	@Field(() => String, { nullable: true })
	agentId?: string; // cars of one agent

	@IsOptional()
	@IsIn(Object.values(CarBrand), { each: true })
	@Field(() => [CarBrand], { nullable: true })
	brandList?: CarBrand[];

	@IsOptional()
	@IsString({ each: true })
	@Field(() => [String], { nullable: true })
	modelList?: string[];

	@IsOptional()
	@IsIn(Object.values(CarType), { each: true })
	@Field(() => [CarType], { nullable: true })
	typeList?: CarType[];

	@IsOptional()
	@IsIn(Object.values(CarColor), { each: true })
	@Field(() => [CarColor], { nullable: true })
	colorList?: CarColor[];

	@IsOptional()
	@IsIn(Object.values(CarLocation), { each: true })
	@Field(() => [CarLocation], { nullable: true })
	locationList?: CarLocation[];

	@IsOptional()
	@IsIn(Object.values(CarCondition), { each: true })
	@Field(() => [CarCondition], { nullable: true })
	conditionList?: CarCondition[];

	@IsOptional()
	@IsIn(Object.values(CarFuelType), { each: true })
	@Field(() => [CarFuelType], { nullable: true })
	fuelList?: CarFuelType[];

	@IsOptional()
	@IsIn(Object.values(CarTransmission), { each: true })
	@Field(() => [CarTransmission], { nullable: true })
	transmissionList?: CarTransmission[];

	/** car must have ALL selected options */
	@IsOptional()
	@IsIn(Object.values(CarOption), { each: true })
	@Field(() => [CarOption], { nullable: true })
	optionList?: CarOption[];

	/**
	 * "Where can I buy it?" DOMESTIC = DOMESTIC + BOTH cars, EXPORT = EXPORT + BOTH cars, BOTH = only BOTH cars.
	 */
	@IsOptional()
	@IsIn(Object.values(CarMarket))
	@Field(() => CarMarket, { nullable: true })
	market?: CarMarket;

	/** KRW (won). Cars without a KRW price (export only) never match */
	@IsOptional()
	@ValidateNested() // without it nothing inside is validated
	@Type(() => NumberRange)
	@Field(() => NumberRange, { nullable: true })
	priceRange?: NumberRange;

	/** USD. Cars without a USD price (domestic only) never match */
	@IsOptional()
	@ValidateNested() // without it nothing inside is validated
	@Type(() => NumberRange)
	@Field(() => NumberRange, { nullable: true })
	priceUsdRange?: NumberRange;

	@IsOptional()
	@ValidateNested() // without it nothing inside is validated
	@Type(() => NumberRange)
	@Field(() => NumberRange, { nullable: true })
	mileageRange?: NumberRange;

	@IsOptional()
	@ValidateNested() // without it nothing inside is validated
	@Type(() => NumberRange)
	@Field(() => NumberRange, { nullable: true })
	yearRange?: NumberRange;

	/** true = only cars offering it. false/undefined = no filter */
	@IsOptional()
	@IsBoolean()
	@Field(() => Boolean, { nullable: true })
	barter?: boolean;

	@IsOptional()
	@IsBoolean()
	@Field(() => Boolean, { nullable: true })
	rent?: boolean;

	@IsOptional()
	@IsBoolean()
	@Field(() => Boolean, { nullable: true })
	testDrive?: boolean;

	@IsOptional()
	@Length(2, 50)
	@Field(() => String, { nullable: true })
	text?: string; // keyword search on title / model / description
}

@InputType()
export class CarsInquiry {
	@IsInt()
	@Min(1)
	@Max(100)
	@Field(() => Int)
	limit: number;

	@IsOptional()
	@IsIn(Object.values(CarSort))
	@Field(() => CarSort, { nullable: true, defaultValue: CarSort.CREATED_AT })
	sort?: CarSort;

	@IsOptional()
	@IsIn([Direction.ASC, Direction.DESC])
	@Field(() => Direction, { nullable: true, defaultValue: Direction.DESC })
	direction?: Direction;

	/** opaque string from the previous page's nextCursor. Omit for the first page. */
	@IsOptional()
	@IsString()
	@Field(() => String, { nullable: true })
	cursor?: string;

	@IsOptional()
	@ValidateNested() // without it nothing inside search (agentId, text, lists, ranges) is validated
	@Type(() => CarsSearch)
	@Field(() => CarsSearch, { nullable: true })
	search?: CarsSearch;
}

/** createCar mutation input. memberId is NOT here: it comes from the JWT. */
@InputType()
export class CarInput {
	@IsIn(Object.values(CarType))
	@Field(() => CarType)
	carType: CarType;

	@IsIn(Object.values(CarBrand))
	@Field(() => CarBrand)
	carBrand: CarBrand;

	/** must be one of CAR_MODELS[carBrand]; free text only for brand OTHER */
	@IsString()
	@Satisfies<CarInput>((o, v) => isValidModel(o.carBrand, v), 'Pick a model from the list for this brand')
	@Field(() => String)
	carModel: string;

	@IsInt()
	@Min(CAR_YEAR_MIN)
	@Satisfies<CarInput>((_, v) => v <= carYearMax(), 'Year cannot be in the future')
	@Field(() => Int)
	carYear: number;

	@IsInt()
	@Min(0)
	@Max(2_000_000)
	@Field(() => Int)
	carMileage: number;

	@IsIn(Object.values(CarColor))
	@Field(() => CarColor)
	carColor: CarColor;

	@IsIn(Object.values(CarCondition))
	@Field(() => CarCondition)
	carCondition: CarCondition;

	@IsIn(Object.values(CarFuelType))
	@Field(() => CarFuelType)
	carFuelType: CarFuelType;

	@IsIn(Object.values(CarTransmission))
	@Field(() => CarTransmission)
	carTransmission: CarTransmission;

	@IsIn(Object.values(CarLocation))
	@Field(() => CarLocation)
	carLocation: CarLocation;

	@Length(3, 150)
	@Field(() => String)
	carAddress: string;

	@Length(5, 100)
	@Field(() => String)
	carTitle: string;

	// ---- market & prices
	@IsIn(Object.values(CarMarket))
	@Field(() => CarMarket)
	carMarket: CarMarket;

	/** KRW (won). Required for DOMESTIC and BOTH */
	@ValidateIf((o: CarInput) => o.carMarket !== CarMarket.EXPORT)
	@IsNumber()
	@Min(1)
	@Field(() => Number, { nullable: true })
	carPrice?: number;

	/** USD. Required for EXPORT and BOTH */
	@ValidateIf((o: CarInput) => o.carMarket !== CarMarket.DOMESTIC)
	@IsNumber()
	@Min(1)
	@Field(() => Number, { nullable: true })
	carPriceUsd?: number;

	/** dealer ticks "export is fully my responsibility". Required true for EXPORT and BOTH */
	@ValidateIf((o: CarInput) => o.carMarket !== CarMarket.DOMESTIC)
	@Equals(true, { message: 'Confirm that you are fully responsible for the export' })
	@Field(() => Boolean, { nullable: true })
	exportAgreed?: boolean;

	// ---- deal options
	@IsBoolean()
	@Satisfies<CarInput>(
		(o, v) => !(v && o.carMarket === CarMarket.EXPORT),
		'Export-only cars cannot be offered for rent',
	)
	@Field(() => Boolean)
	carRent: boolean;

	/** KRW per day. Required when carRent */
	@ValidateIf((o: CarInput) => o.carRent)
	@IsNumber()
	@Min(1)
	@Field(() => Number, { nullable: true })
	carRentPrice?: number;

	@IsBoolean()
	@Field(() => Boolean)
	carBarter: boolean;

	@IsBoolean()
	@Field(() => Boolean)
	carTestDrive: boolean;

	@ArrayMinSize(1)
	@ArrayMaxSize(20)
	// URLs from POST /upload/images (target=car). CarService also checks they are OUR uploads.
	// require_tld: false so local-storage URLs (http://localhost:3007/uploads/...) pass in development
	@IsUrl({ require_tld: false, require_protocol: true, protocols: ['http', 'https'] }, { each: true })
	@Field(() => [String])
	carImages: string[];

	@IsOptional()
	@Length(0, 3000)
	@Field(() => String, { nullable: true })
	carDesc?: string;

	@IsOptional()
	@IsIn(Object.values(CarOption), { each: true })
	@Field(() => [CarOption], { nullable: true })
	carOptions?: CarOption[];
}
