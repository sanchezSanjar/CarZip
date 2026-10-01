import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { SolapiMessageService } from 'solapi';
import { Message } from '../../libs/enums/common.enum';

export interface SmsResult {
	groupId: string | null; // Solapi's id for this send (search it in the Solapi console). null in log-only mode
	to: string;
	logOnly: boolean;
}

/**
 * Sends SMS through Solapi (https://solapi.com). Keys come from .env:
 *   SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER_NUMBER (must be registered as a sender in Solapi)
 * Without keys (a teammate's machine, CI) it runs in log-only mode: the text is written to the server log
 * instead of being sent, so the app still starts and OTP flows can be tested for free.
 */
@Injectable()
export class SmsService implements OnModuleInit {
	private readonly logger = new Logger('SmsService');
	private client: SolapiMessageService | null = null;
	private sender = '';

	public onModuleInit(): void {
		const { SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER_NUMBER } = process.env;
		if (!SOLAPI_API_KEY || !SOLAPI_API_SECRET || !SOLAPI_SENDER_NUMBER) {
			this.logger.warn('Solapi keys are missing in .env: SMS runs in LOG-ONLY mode, nothing is sent');
			return;
		}
		this.client = new SolapiMessageService(SOLAPI_API_KEY, SOLAPI_API_SECRET);
		this.sender = this.digits(SOLAPI_SENDER_NUMBER);
	}

	public get isLogOnly(): boolean {
		return this.client === null;
	}

	public async sendSms(to: string, text: string): Promise<SmsResult> {
		const phone = this.digits(to);
		if (!this.client) {
			this.logger.log(`[LOG-ONLY] SMS to ${this.mask(phone)}: ${text}`);
			return { groupId: null, to: phone, logOnly: true };
		}

		try {
			const result = await this.client.send({ to: phone, from: this.sender, text });
			const failed = result.failedMessageList?.[0];
			if (failed) throw new Error(`${failed.statusCode} ${failed.statusMessage}`);

			const groupId = result.groupInfo?.groupId ?? null;
			this.logger.log(`SMS sent to ${this.mask(phone)} (groupId: ${groupId})`);
			return { groupId, to: phone, logOnly: false };
		} catch (err: any) {
			// full provider error stays in our log; the client only learns that SMS failed
			this.logger.error(`SMS to ${this.mask(phone)} failed: ${err?.message ?? err}`);
			throw new ServiceUnavailableException(Message.SMS_FAILED);
		}
	}

	/** remaining Solapi balance (KRW) and points: checks the keys without sending anything */
	public async getBalance(): Promise<{ balance: number; point: number; logOnly: boolean }> {
		if (!this.client) return { balance: 0, point: 0, logOnly: true };
		try {
			const { balance, point } = await this.client.getBalance();
			return { balance, point, logOnly: false };
		} catch (err: any) {
			this.logger.error(`Solapi balance check failed: ${err?.message ?? err}`);
			throw new ServiceUnavailableException(Message.SMS_FAILED);
		}
	}

	private digits(phone: string): string {
		return phone.replace(/\D/g, '');
	}

	/** 01012345678 -> 010****5678, phone numbers are personal data */
	private mask(phone: string): string {
		return phone.length > 7 ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : '****';
	}
}
