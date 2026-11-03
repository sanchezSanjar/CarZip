import { describe, it, expect, vi } from 'vitest';
import { Types } from 'mongoose';
import { MemberService } from './member.service';
import { MemberStatus, MemberType } from '@app/common/enums/member.enum';

// a mongoose call chain ending in .exec()
const resolved = <T>(value: T) => ({ exec: vi.fn().mockResolvedValue(value) });

const memberId = new Types.ObjectId();
const activeMember = {
	_id: memberId,
	memberNick: 'cz_buyer',
	memberType: MemberType.USER,
	memberStatus: MemberStatus.ACTIVE,
	memberPassword: 'hash',
};
const device = { deviceId: 'device-phone-1' };

/** MemberService with only what login() uses; everything is fake, no database */
function setup() {
	const memberModel = {
		findOne: vi.fn(() => ({ select: () => ({ lean: () => resolved(activeMember) }) })),
		findById: vi.fn(() => ({ select: () => ({ lean: () => resolved(activeMember) }) })),
		findOneAndUpdate: vi.fn(() => ({ lean: () => resolved({ ...activeMember, memberPassword: undefined }) })),
	};
	const authService = {
		comparePassword: vi.fn().mockResolvedValue(true),
		hashPassword: vi.fn().mockResolvedValue('new-hash'),
		createToken: vi.fn().mockResolvedValue('access-token'),
		startSession: vi.fn().mockResolvedValue({ accessToken: 'short-token', refreshToken: 'refresh-token' }),
		revokeMemberSessions: vi.fn().mockResolvedValue(undefined),
	};
	const loginAttemptModel = {
		countDocuments: vi.fn(() => resolved(0)),
		create: vi.fn(),
		deleteMany: vi.fn(() => resolved({})),
	};
	const service = Object.assign(Object.create(MemberService.prototype), {
		memberModel,
		authService,
		loginAttemptModel,
	}) as MemberService;
	return { service, authService };
}

describe('MemberService.login: tokens', () => {
	const input = { memberNick: 'cz_buyer', memberPassword: 'right' };

	it('without a device: the 30-day access token only, as the web gets today', async () => {
		const { service, authService } = setup();
		const member = await service.login(input, '1.2.3.4');
		expect(member).toMatchObject({ accessToken: 'access-token' });
		expect(member.refreshToken).toBeUndefined();
		expect(authService.startSession).not.toHaveBeenCalled();
	});

	it('with a device: a session with a short access token and a refresh token, never the password', async () => {
		const { service, authService } = setup();
		const member = await service.login({ ...input, device }, '1.2.3.4');
		expect(member).toMatchObject({ accessToken: 'short-token', refreshToken: 'refresh-token' });
		expect(member).not.toHaveProperty('memberPassword');
		expect(authService.startSession).toHaveBeenCalledWith(
			expect.objectContaining({ _id: memberId }),
			device,
			'1.2.3.4',
		);
	});
});
