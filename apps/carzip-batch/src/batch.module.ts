import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { BatchController } from './batch.controller';
import { BatchService } from './batch.service';
import { DatabaseModule } from './database/database.module';
import CarSchema from '../../carzip-api/src/schemas/Car.model';
import MemberSchema from '../../carzip-api/src/schemas/Member.model';

@Module({
	imports: [
		ConfigModule.forRoot(),
		DatabaseModule,
		ScheduleModule.forRoot(),
		MongooseModule.forFeature([
			{ name: 'Car', schema: CarSchema },
			{ name: 'Member', schema: MemberSchema },
		]),
	],
	controllers: [BatchController],
	providers: [BatchService],
})
export class BatchModule {}
