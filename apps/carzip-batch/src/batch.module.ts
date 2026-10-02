import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { BatchController } from './batch.controller';
import { BatchService } from './batch.service';
import { DatabaseModule } from './database/database.module';
import CarSchema from '../../carzip-api/src/schemas/Car.model';
import MemberSchema from '../../carzip-api/src/schemas/Member.model';
import TestDriveSchema from '../../carzip-api/src/schemas/TestDrive.model';
import NotificationSchema from '../../carzip-api/src/schemas/Notification.model';
import BoardArticleSchema from '../../carzip-api/src/schemas/BoardArticle.model';
import { TestDriveBatchService } from './test-drive.batch';
import { UploadBatchService } from './upload.batch';

@Module({
	imports: [
		ConfigModule.forRoot(),
		DatabaseModule,
		ScheduleModule.forRoot(),
		MongooseModule.forFeature([
			{ name: 'Car', schema: CarSchema },
			{ name: 'Member', schema: MemberSchema },
			{ name: 'TestDrive', schema: TestDriveSchema },
			{ name: 'Notification', schema: NotificationSchema },
			{ name: 'BoardArticle', schema: BoardArticleSchema },
		]),
	],
	controllers: [BatchController],
	providers: [BatchService, TestDriveBatchService, UploadBatchService],
})
export class BatchModule {}
