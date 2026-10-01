import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import MemberSchema from '../../schemas/Member.model';
import BlockSchema from '../../schemas/Block.model';
import { MemberResolver } from './member.resolver';
import { MemberService } from './member.service';
import { AuthModule } from '../auth/auth.module';
import { OtpModule } from '../otp/otp.module';
import { ViewModule } from '../view/view.module';
import { CarModule } from '../car/car.module';
import { NotificationModule } from '../notification/notification.module';
import { LikeModule } from '../like/like.module';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Member', schema: MemberSchema },
			{ name: 'Block', schema: BlockSchema }, // personal blocks stop likes too
		]),
		AuthModule,
		OtpModule,
		ViewModule,
		CarModule,
		NotificationModule,
		LikeModule,
	],
	providers: [MemberResolver, MemberService],
})
export class MemberModule {}
