import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import MemberSchema from '@app/common/schemas/Member.model';
import BlockSchema from '@app/common/schemas/Block.model';
import FollowSchema from '@app/common/schemas/Follow.model';
import LoginAttemptSchema from '@app/common/schemas/LoginAttempt.model';
import { MemberResolver } from './member.resolver';
import { MemberService } from './member.service';
import { AuthModule } from '../auth/auth.module';
import { OtpModule } from '../otp/otp.module';
import { ViewModule } from '../view/view.module';
import { CarModule } from '../car/car.module';
import { NotificationModule } from '../notification/notification.module';
import { LikeModule } from '../like/like.module';
import { TestDriveModule } from '../test-drive/test-drive.module';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Member', schema: MemberSchema },
			{ name: 'Block', schema: BlockSchema }, // personal blocks stop likes too
			{ name: 'Follow', schema: FollowSchema }, // "do I follow this member?"
			{ name: 'LoginAttempt', schema: LoginAttemptSchema }, // failed logins, for the login limit
		]),
		AuthModule,
		OtpModule,
		ViewModule,
		CarModule,
		NotificationModule,
		LikeModule,
		TestDriveModule, // a blocked / deleted member's open test-drive requests are cancelled
	],
	providers: [MemberResolver, MemberService],
})
export class MemberModule {}
