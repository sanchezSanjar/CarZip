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
import { ReminderBatchService } from './reminder.batch';
import { CounterBatchService } from './counter.batch';
import LikeSchema from '@app/common/schemas/Like.model';
import CommentSchema from '@app/common/schemas/Comment.model';
import ViewSchema from '@app/common/schemas/View.model';
import FollowSchema from '@app/common/schemas/Follow.model';

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
			{ name: 'Like', schema: LikeSchema },
			{ name: 'Comment', schema: CommentSchema },
			{ name: 'View', schema: ViewSchema },
			{ name: 'Follow', schema: FollowSchema },
		]),
	],
	controllers: [BatchController],
	providers: [BatchService, TestDriveBatchService, UploadBatchService, ReminderBatchService, CounterBatchService],
})
export class BatchModule {}
