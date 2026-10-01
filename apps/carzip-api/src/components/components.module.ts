import { Module } from '@nestjs/common';
import { MemberModule } from './member/member.module';
import { CarModule } from './car/car.module';
import { SmsModule } from './sms/sms.module';
import { OtpModule } from './otp/otp.module';
import { ViewModule } from './view/view.module';
import { NotificationModule } from './notification/notification.module';
import { UploadModule } from './upload/upload.module';
import { BoardArticleModule } from './board-article/board-article.module';

@Module({
	imports: [
		MemberModule,
		CarModule,
		SmsModule,
		OtpModule,
		ViewModule,
		NotificationModule,
		UploadModule,
		BoardArticleModule,
	],
})
export class ComponentsModule {}
