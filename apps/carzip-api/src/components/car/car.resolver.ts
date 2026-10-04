import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Types } from 'mongoose';
import { CarService } from './car.service';
import { Car, CarCatalogBrand, Cars, CarsPage, CarStats } from '../../libs/dto/car/car';
import { CAR_MODELS } from '@app/common/config/car-catalog';
import { CarBrand } from '@app/common/enums/car.enum';
import { AgentCarsInquiry, AllCarsInquiry, CarInput, CarsInquiry, OrdinaryInquiry } from '../../libs/dto/car/car.input';
import { CarUpdate, CarUpdateByAdmin } from '../../libs/dto/car/car.update';
import { MemberType } from '@app/common/enums/member.enum';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { WithoutGuard } from '../auth/guards/without.guard';
import { AuthGuard } from '../auth/guards/auth.guard';
import { AuthMemberData } from '../../libs/types/auth';
import { shapeIntoMongoObjectId } from '../../libs/config';

@Resolver()
export class CarResolver {
	constructor(private readonly carService: CarService) {}

	// Car Listing flowchart: RolesGuard AGENT (and ACTIVE: no other agent has a working token)
	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Mutation(() => Car)
	public async createCar(
		@Args('input') input: CarInput,
		@AuthMember('_id') memberId: Types.ObjectId, // the owner always comes from the JWT, never from the client
	): Promise<Car> {
		return this.carService.createCar(memberId, input);
	}

	// Car Listing flowchart: an agent changes their OWN car (edit / pause / re-activate / sold / delete)
	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Mutation(() => Car)
	public async updateCar(@Args('input') input: CarUpdate, @AuthMember('_id') memberId: Types.ObjectId): Promise<Car> {
		return this.carService.updateCar(memberId, input);
	}

	// "Still for sale": the dealer confirms their ACTIVE listing is current (answer to the LISTING_CHECK reminder)
	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Mutation(() => Car)
	public async confirmCarListing(
		@Args('carId') carId: string,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Car> {
		return this.carService.confirmCarListing(memberId, shapeIntoMongoObjectId(carId));
	}

	// Public car search: guests and members. Logged-in viewers also get meLiked on every car
	@UseGuards(WithoutGuard)
	@Query(() => Cars)
	public async getCars(
		@Args('input') input: CarsInquiry,
		@AuthMember() authMember: AuthMemberData | null,
	): Promise<Cars> {
		return this.carService.getCars(input, authMember);
	}

	// "My favorites": the cars the logged-in member liked
	@UseGuards(AuthGuard)
	@Query(() => CarsPage)
	public async getFavorites(
		@Args('input') input: OrdinaryInquiry,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<CarsPage> {
		return this.carService.getFavorites(memberId, input);
	}

	// "Recently viewed": the cars the logged-in member opened, the latest first
	@UseGuards(AuthGuard)
	@Query(() => CarsPage)
	public async getVisited(
		@Args('input') input: OrdinaryInquiry,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<CarsPage> {
		return this.carService.getVisited(memberId, input);
	}

	// "My cars" dashboard: always the logged-in agent's own cars
	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Query(() => CarsPage)
	public async getAgentCars(
		@Args('input') input: AgentCarsInquiry,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<CarsPage> {
		return this.carService.getAgentCars(memberId, input);
	}

	/** ADMIN */

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => CarsPage)
	public async getAllCarsByAdmin(@Args('input') input: AllCarsInquiry): Promise<CarsPage> {
		return this.carService.getAllCarsByAdmin(input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Car)
	public async updateCarByAdmin(
		@Args('input') input: CarUpdateByAdmin,
		@AuthMember('_id') adminId: Types.ObjectId,
	): Promise<Car> {
		return this.carService.updateCarByAdmin(adminId, input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Car)
	public async removeCarByAdmin(@Args('carId') carId: string): Promise<Car> {
		return this.carService.removeCarByAdmin(shapeIntoMongoObjectId(carId));
	}

	// like / un-like a car (toggle): any logged-in member, except the car's own dealer
	@UseGuards(AuthGuard)
	@Mutation(() => Car)
	public async likeTargetCar(@Args('carId') carId: string, @AuthMember('_id') memberId: Types.ObjectId): Promise<Car> {
		return this.carService.likeTargetCar(memberId, shapeIntoMongoObjectId(carId));
	}

	// Public: the welcome page numbers (cars for sale per brand, type, fuel, region), cached in Redis
	@Query(() => CarStats)
	public async getCarStats(): Promise<CarStats> {
		return this.carService.getCarStats();
	}

	// Public: brand -> models for the "Add car" form and the model filter (createCar accepts only these models;
	// brand OTHER takes a free-text model). Static data, no database.
	@Query(() => [CarCatalogBrand])
	public getCarCatalog(): CarCatalogBrand[] {
		return Object.values(CarBrand).map((brand) => ({ brand, models: CAR_MODELS[brand] }));
	}

	// Public car detail: guests read it, logged-in viewers also count a view
	@UseGuards(WithoutGuard)
	@Query(() => Car)
	public async getCar(@Args('carId') carId: string, @AuthMember() authMember: AuthMemberData | null): Promise<Car> {
		return this.carService.getCar(shapeIntoMongoObjectId(carId), authMember);
	}
}
