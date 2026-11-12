import { describe, it, expect, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import { OtpService } from './otp.service';
import { Message } from '@app/common/enums/common.enum';
import { OtpPurpose } from '@app/common/enums/otp.enum';

// a mongoose call chain ending in .exec()
const resolved = <T>(value: T) => ({ exec: vi.fn().mockResolvedValue(value) });

// the code hash is an HMAC with the server secret
process.env.SECRET_TOKEN ??= 'test-secret';

/** a fake RedisService: counters and claims in a Map, like the real one but in memory */
function fakeRedis(ready = true) {
	const counters = new Map<string, number>();
	const claims = new Set<string>();
	return {
		counters,
		claims,
		countHit: vi.fn(async (key: string) => {
			if (!ready) return null;
			const count = (counters.get(key) ?? 0) + 1;
			counters.set(key, count);
			return count;
		}),
		claim: vi.fn(async (key: string) => {
			if (!ready) return null;
			if (claims.has(key)) return false;
			claims.add(key);
			return true;
		}),
	};
}

type FakeRedis = ReturnType<typeof fakeRedis>;

/** OtpService with only what requestOtp() needs for a SIGNUP code; no database, no SMS */
function setup({ redis, dbCodesThisHour = 0 }: { redis?: FakeRedis; dbCodesThisHour?: number } = {}) {
	const otpModel = {
		findOne: vi.fn(() => ({ sort: () => ({ select: () => ({ lean: () => resolved(null) }) }) })),
		countDocuments: vi.fn(() => resolved(dbCodesThisHour)),
		updateMany: vi.fn(() => resolved({})),
		create: vi.fn().mockResolvedValue({}),
	};
	const memberModel = { exists: vi.fn(() => resolved(null)) };
	const smsService = { sendSms: vi.fn().mockResolvedValue({ groupId: 'g1', to: '01012345678', logOnly: false }) };
	const service = Object.assign(Object.create(OtpService.prototype), {
		otpModel,
		memberModel,
		smsService,
		redis,
	}) as OtpService;
	const request = (phone = '01012345678', ip = '1.2.3.4') =>
		service.requestOtp({ otpPhone: phone, otpPurpose: OtpPurpose.SIGNUP }, ip, null);
	return { service, request, otpModel, smsService };
}

/** the HTTP status an attempt ended with, or "sent" */
const outcome = async (promise: Promise<unknown>): Promise<number | 'sent'> => {
	const result = await promise.catch((e: unknown) => e);
	if (result instanceof HttpException) return result.getStatus();
	if (result instanceof Error) throw result;
	return 'sent';
};

describe('OtpService.requestOtp: limits counted in Redis (atomic)', () => {
	it('5 codes per phone and hour, the 6th is refused with 429 and sends no SMS', async () => {
		const redis = fakeRedis();
		const { request, smsService } = setup({ redis });
		for (let i = 0; i < 5; i++) {
			redis.claims.clear(); // a minute passed: the resend cooldown is over
			expect(await outcome(request())).toBe('sent');
		}
		redis.claims.clear();
		const error = await request().catch((e: unknown) => e);
		expect(error).toBeInstanceOf(HttpException);
		expect((error as HttpException).getStatus()).toBe(429);
		expect((error as HttpException).message).toBe(Message.OTP_TOO_MANY_REQUESTS);
		expect(smsService.sendSms).toHaveBeenCalledTimes(5);
	});

	it('a second code for the same phone within a minute must wait', async () => {
		const { request, smsService } = setup({ redis: fakeRedis() });
		expect(await outcome(request())).toBe('sent');
		const error = await request().catch((e: unknown) => e);
		expect((error as HttpException).message).toBe(Message.OTP_WAIT_BEFORE_RESEND);
		expect(smsService.sendSms).toHaveBeenCalledTimes(1);
	});

	it('a burst of 25 requests at the same moment from one IP sends exactly 20 SMS', async () => {
		const { request, smsService } = setup({ redis: fakeRedis() });
		// 25 different phones, one address, all at once: the counter is atomic, so no "count then decide" race
		const results = await Promise.all(
			Array.from({ length: 25 }, (_, i) => outcome(request(`0101234${String(i).padStart(4, '0')}`, '5.5.5.5'))),
		);
		expect(results.filter((r) => r === 'sent')).toHaveLength(20);
		expect(results.filter((r) => r === 429)).toHaveLength(5);
		expect(smsService.sendSms).toHaveBeenCalledTimes(20);
	});

	it('the hour counters are per phone and purpose, and per IP', async () => {
		const redis = fakeRedis();
		const { request } = setup({ redis });
		await request('01011112222', '1.1.1.1');
		expect([...redis.counters.keys()]).toEqual(['otp:phone:SIGNUP:01011112222', 'otp:ip:1.1.1.1']);
	});

	it('counts in the database while Redis is down, and still refuses the 6th code', async () => {
		const down = fakeRedis(false);
		const ok = setup({ redis: down, dbCodesThisHour: 4 });
		expect(await outcome(ok.request())).toBe('sent');
		expect(ok.otpModel.countDocuments).toHaveBeenCalled();

		const full = setup({ redis: down, dbCodesThisHour: 5 });
		expect(await outcome(full.request())).toBe(429);
		expect(full.smsService.sendSms).not.toHaveBeenCalled();
	});

	it('works the same without any Redis (REDIS_URL unset)', async () => {
		const full = setup({ redis: undefined, dbCodesThisHour: 5 });
		expect(await outcome(full.request())).toBe(429);
		const ok = setup({ redis: undefined, dbCodesThisHour: 0 });
		expect(await outcome(ok.request())).toBe('sent');
	});
});
