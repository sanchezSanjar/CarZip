import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import CarSchema from '../../schemas/Car.model';
import MemberSchema from '../../schemas/Member.model';
import { CarService } from './car.service';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Car', schema: CarSchema },
			{ name: 'Member', schema: MemberSchema }, // memberCars counter
		]),
	],
	providers: [CarService],
	exports: [CarService], // admin moderation in MemberService
})
export class CarModule {}
