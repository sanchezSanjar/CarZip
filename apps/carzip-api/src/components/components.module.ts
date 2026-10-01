import { Module } from '@nestjs/common';
import { MemberModule } from './member/member.module';
import { CarModule } from './car/car.module';
import { SmsModule } from './sms/sms.module';
import { OtpModule } from './otp/otp.module';
import { ViewModule } from './view/view.module';

@Module({
	imports: [MemberModule, CarModule, SmsModule, OtpModule, ViewModule],
})
export class ComponentsModule {}
