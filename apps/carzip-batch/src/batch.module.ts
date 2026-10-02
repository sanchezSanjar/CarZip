import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { BatchController } from './batch.controller';
import { BatchService } from './batch.service';
import { DatabaseModule } from '@app/common/database/database.module';
import CarSchema from '@app/common/schemas/Car.model';
import MemberSchema from '@app/common/schemas/Member.model';
import TestDriveSchema from '@app/common/schemas/TestDrive.model';
import NotificationSchema from '@app/common/schemas/Notification.model';
import BoardArticleSchema from '@app/common/schemas/BoardArticle.model';
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
