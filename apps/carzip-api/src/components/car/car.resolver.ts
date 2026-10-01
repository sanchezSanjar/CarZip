import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { Types } from 'mongoose';
import { CarService } from './car.service';
import { Car } from '../../libs/dto/car/car';
import { CarInput } from '../../libs/dto/car/car.input';
import { MemberType } from '../../libs/enums/member.enum';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthMember } from '../auth/decorators/authMember.decorator';

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
}
