import { describe, it, expect, vi } from 'vitest';
import { Types } from 'mongoose';
import { MemberService } from './member.service';
import { MemberStatus, MemberType } from '@app/common/enums/member.enum';

const resolved = <T>(value: T) => ({ exec: vi.fn().mockResolvedValue(value) });
const flush = () => new Promise((r) => setTimeout(r, 0)); // the SMS is sent in the background

/** MemberService with only what signup() uses; everything is fake, no database or real SMS */
function setup(memberType: MemberType, { smsFails = false } = {}) {
	const admins = [{ memberPhone: '01011112222' }, { memberPhone: '01033334444' }];
	const memberModel = {
		create: vi.fn(async (data: Record<string, unknown>) => ({
			toObject: () => ({ ...data, _id: new Types.ObjectId(), memberPassword: 'hash' }),
		})),
		find: vi.fn(() => ({ select: () => ({ lean: () => resolved(admins) }) })),
	};
	const smsService = {
		sendSms: vi.fn(smsFails ? () => Promise.reject(new Error('Solapi down')) : () => Promise.resolve({})),
	};
	const service = Object.assign(Object.create(MemberService.prototype), {
		memberModel,
		smsService,
		logger: { error: vi.fn() },
		otpService: { assertPhoneVerified: vi.fn(), markPhoneUsed: vi.fn() },
		uploadService: { isUploadedImage: vi.fn(() => true) },
		authService: { hashPassword: vi.fn(async () => 'hash'), createToken: vi.fn(async () => 'token') },
		notificationService: { notifyAdmins: vi.fn() },
	}) as MemberService;
	const signup = () =>
		service.signup({
			memberNick: 'new_dealer',
			memberPhone: '01055556666',
			memberPassword: 'secret12',
			memberType,
			agentCompany: 'Fast Motors',
		} as never);
	return { signup, smsService };
}

describe('MemberService.signup: SMS to the admins when a dealer applies', () => {
	it('texts every active admin about a new dealer application', async () => {
		const { signup, smsService } = setup(MemberType.AGENT);
		const member = await signup();
		await flush();
		expect(member.memberStatus).toBe(MemberStatus.PENDING);
		expect(smsService.sendSms).toHaveBeenCalledTimes(2);
		expect(smsService.sendSms).toHaveBeenCalledWith('01011112222', expect.stringContaining('new_dealer (Fast Motors)'));
	});

	it('sends nothing when a buyer signs up', async () => {
		const { signup, smsService } = setup(MemberType.USER);
		await signup();
		await flush();
		expect(smsService.sendSms).not.toHaveBeenCalled();
	});

	it('still signs the dealer up when the SMS fails', async () => {
		const { signup } = setup(MemberType.AGENT, { smsFails: true });
		await expect(signup()).resolves.toMatchObject({ memberStatus: MemberStatus.PENDING });
		await flush();
	});
});
