import { Field, Int, ObjectType } from '@nestjs/graphql';
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

/** What the public may see about an agent. Verification data (business no., card) is NEVER here. */
@ObjectType()
export class AgentPublic {
	@Field(() => String) _id: string;
	@Field(() => String) memberNick: string;
	@Field(() => String, { nullable: true }) memberImage?: string;
	@Field(() => String, { nullable: true }) agentCompany?: string;
	@Field(() => Int) memberRank: number;
	@Field(() => String, { nullable: true }) contactPhone?: string;
	@Field(() => String, { nullable: true }) contactEmail?: string;
	@Field(() => String, { nullable: true }) contactTelegram?: string;
	@Field(() => String, { nullable: true }) contactWhatsapp?: string;
	@Field(() => String, { nullable: true }) contactKakao?: string;
}

@ObjectType()
export class Car {
	@Field(() => String) _id: string;
	@Field(() => CarType) carType: CarType;
	@Field(() => CarStatus) carStatus: CarStatus;
	@Field(() => CarBrand) carBrand: CarBrand;
	@Field(() => String) carModel: string;
	@Field(() => Int) carYear: number;
	@Field(() => Int) carMileage: number;
	@Field(() => CarColor) carColor: CarColor;
	@Field(() => CarCondition) carCondition: CarCondition;
	@Field(() => CarFuelType) carFuelType: CarFuelType;
	@Field(() => CarTransmission) carTransmission: CarTransmission;
	@Field(() => CarLocation) carLocation: CarLocation;
	@Field(() => String) carAddress: string;
	@Field(() => String) carTitle: string;
	@Field(() => CarMarket) carMarket: CarMarket;
	/** KRW. null for EXPORT-only cars */
	@Field(() => Number, { nullable: true }) carPrice?: number;
	/** USD. null for DOMESTIC-only cars */
	@Field(() => Number, { nullable: true }) carPriceUsd?: number;
	@Field(() => Number, { nullable: true }) carRentPrice?: number;
	@Field(() => [String]) carImages: string[];
	@Field(() => String, { nullable: true }) carDesc?: string;
	@Field(() => [CarOption]) carOptions: CarOption[];
	@Field(() => Boolean) carBarter: boolean;
	@Field(() => Boolean) carRent: boolean;
	@Field(() => Boolean) carTestDrive: boolean;
	@Field(() => Int) carViews: number;
	@Field(() => Int) carLikes: number;
	@Field(() => Int) carComments: number;
	@Field(() => Int) carRank: number;
	@Field(() => String) memberId: string;
	@Field(() => Date, { nullable: true }) soldAt?: Date;
	@Field(() => Date) createdAt: Date;
	@Field(() => Date) updatedAt: Date;

	/** joined in the same aggregation — no N+1 */
	@Field(() => AgentPublic, { nullable: true }) agentData?: AgentPublic;
}

@ObjectType()
export class Cars {
	@Field(() => [Car]) list: Car[];
	/** pass back as CarsInquiry.cursor to get the next page. null = no more cars */
	@Field(() => String, { nullable: true }) nextCursor?: string | null;
}

/** Brand -> models list for the "add car" form and the model filter. Served by the API so web and mobile never drift. */
@ObjectType()
export class CarCatalogBrand {
	@Field(() => CarBrand) brand: CarBrand;
	@Field(() => [String]) models: string[];
}
