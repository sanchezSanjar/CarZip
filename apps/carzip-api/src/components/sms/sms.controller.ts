import { Controller, Get, UseGuards } from '@nestjs/common';
import { SmsService } from './sms.service';
import { MemberType } from '@app/common/enums/member.enum';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

/**
 * REST endpoint to check the Solapi integration (ADMIN only). It sends nothing: SMS go out only as OTP codes,
 * through the OTP service.
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
}
