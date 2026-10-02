import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import OtpSchema from '@app/common/schemas/Otp.model';
import MemberSchema from '@app/common/schemas/Member.model';
import { OtpService } from './otp.service';
import { OtpResolver } from './otp.resolver';
import { AuthModule } from '../auth/auth.module';
import { SmsModule } from '../sms/sms.module';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Otp', schema: OtpSchema },
			{ name: 'Member', schema: MemberSchema },
		]),
		AuthModule, // hashPassword for resetPassword
		SmsModule,
	],
	providers: [OtpService, OtpResolver],
	exports: [OtpService], // signup checks the phone was verified
})
export class OtpModule {}
