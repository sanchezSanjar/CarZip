import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Types } from 'mongoose';
import { CarService } from './car.service';
import { Car, Cars, CarsPage } from '../../libs/dto/car/car';
import { AgentCarsInquiry, AllCarsInquiry, CarInput, CarsInquiry } from '../../libs/dto/car/car.input';
import { CarUpdate, CarUpdateByAdmin } from '../../libs/dto/car/car.update';
import { MemberType } from '../../libs/enums/member.enum';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { WithoutGuard } from '../auth/guards/without.guard';
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

	// Public car search: guests and members (like / "did I like it" comes with the like commits)
	@Query(() => Cars)
	public async getCars(@Args('input') input: CarsInquiry): Promise<Cars> {
		return this.carService.getCars(input);
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
	public async updateCarByAdmin(@Args('input') input: CarUpdateByAdmin): Promise<Car> {
		return this.carService.updateCarByAdmin(input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Car)
	public async removeCarByAdmin(@Args('carId') carId: string): Promise<Car> {
		return this.carService.removeCarByAdmin(shapeIntoMongoObjectId(carId));
	}

	// Public car detail: guests read it, logged-in viewers also count a view
	@UseGuards(WithoutGuard)
	@Query(() => Car)
	public async getCar(@Args('carId') carId: string, @AuthMember() authMember: AuthMemberData | null): Promise<Car> {
		return this.carService.getCar(shapeIntoMongoObjectId(carId), authMember);
	}
}
