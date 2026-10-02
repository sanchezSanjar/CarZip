import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import CarSchema from '@app/common/schemas/Car.model';
import MemberSchema from '@app/common/schemas/Member.model';
import BlockSchema from '@app/common/schemas/Block.model';
import { CarService } from './car.service';
import { CarResolver } from './car.resolver';
import { AuthModule } from '../auth/auth.module';
import { UploadModule } from '../upload/upload.module';
import { ViewModule } from '../view/view.module';
import { LikeModule } from '../like/like.module';
import { NotificationModule } from '../notification/notification.module';
import { TestDriveModule } from '../test-drive/test-drive.module';
import { CommentModule } from '../comment/comment.module';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Car', schema: CarSchema },
			{ name: 'Member', schema: MemberSchema }, // memberCars counter
			{ name: 'Block', schema: BlockSchema }, // personal blocks stop likes
		]),
		AuthModule, // RolesGuard
		UploadModule, // "is this photo one of our uploads?"
		ViewModule, // carViews
		LikeModule, // carLikes
		NotificationModule, // LIKE notification to the dealer
		TestDriveModule, // a car leaving the market cancels its open test drives
		CommentModule, // a car removed for good takes its comments with it
	],
	providers: [CarService, CarResolver],
	exports: [CarService], // admin moderation in MemberService
})
export class CarModule {}
