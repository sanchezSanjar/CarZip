import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { SmsResult, SmsService } from './sms.service';
import { SendSmsInput } from '../../libs/dto/sms/sms.input';
import { MemberType } from '../../libs/enums/member.enum';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

/**
 * REST endpoints to check the Solapi integration. ADMIN only: every SMS costs money,
 * so an open "send SMS to any number" endpoint would let anyone drain the balance.
 * Members never call this; OTP codes are sent by the OTP service.
 */
@Roles(MemberType.ADMIN)
@UseGuards(RolesGuard)
@Controller('sms')
export class SmsController {
	constructor(private readonly smsService: SmsService) {}

	/** GET /sms/balance — verifies the API keys without sending anything */
	@Get('balance')
	public async getBalance() {
		return this.smsService.getBalance();
	}

	/** POST /sms/test  { "to": "01012345678", "text": "CarZip test" } — sends ONE real SMS */
	@Post('test')
	@HttpCode(200)
	public async sendTest(@Body() input: SendSmsInput): Promise<SmsResult> {
		return this.smsService.sendSms(input.to, input.text);
	}
}
