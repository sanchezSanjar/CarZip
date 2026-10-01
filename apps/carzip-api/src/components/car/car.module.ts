import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import CarSchema from '../../schemas/Car.model';
import MemberSchema from '../../schemas/Member.model';
import { CarService } from './car.service';
import { CarResolver } from './car.resolver';
import { AuthModule } from '../auth/auth.module';
import { UploadModule } from '../upload/upload.module';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Car', schema: CarSchema },
			{ name: 'Member', schema: MemberSchema }, // memberCars counter
		]),
		AuthModule, // RolesGuard
		UploadModule, // "is this photo one of our uploads?"
	],
	providers: [CarService, CarResolver],
	exports: [CarService], // admin moderation in MemberService
})
export class CarModule {}
