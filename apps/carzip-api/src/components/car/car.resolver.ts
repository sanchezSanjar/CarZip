import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Types } from 'mongoose';
import { CarService } from './car.service';
import { Car } from '../../libs/dto/car/car';
import { CarInput } from '../../libs/dto/car/car.input';
import { CarUpdate } from '../../libs/dto/car/car.update';
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

	// Public car detail: guests read it, logged-in viewers also count a view
	@UseGuards(WithoutGuard)
	@Query(() => Car)
	public async getCar(@Args('carId') carId: string, @AuthMember() authMember: AuthMemberData | null): Promise<Car> {
		return this.carService.getCar(shapeIntoMongoObjectId(carId), authMember);
	}
}
