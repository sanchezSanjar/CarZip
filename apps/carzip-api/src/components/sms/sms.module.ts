import { Module } from '@nestjs/common';
import { SmsService } from './sms.service';
import { SmsController } from './sms.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
	imports: [AuthModule], // RolesGuard on the controller needs AuthService
	controllers: [SmsController],
	providers: [SmsService],
	exports: [SmsService], // the OTP module will send codes through it
})
export class SmsModule {}
