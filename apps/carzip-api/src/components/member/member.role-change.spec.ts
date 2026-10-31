import { describe, it, expect, vi } from 'vitest';
import { Types } from 'mongoose';
import { MemberService } from './member.service';
import { AuthService } from '../auth/auth.service';
import { Message } from '@app/common/enums/common.enum';
import { MemberStatus, MemberType } from '@app/common/enums/member.enum';

// a mongoose call chain ending in .exec()
const resolved = <T>(value: T) => ({ exec: vi.fn().mockResolvedValue(value) });

/** MemberService with only what updateMemberByAdmin() uses for a role change; everything is fake */
function setup(memberType: MemberType, { listedCars = 0, openTestDrives = 0 } = {}) {
	const admin = {
		_id: new Types.ObjectId(),
		memberNick: 'admin',
		memberType: MemberType.ADMIN,
		memberStatus: MemberStatus.ACTIVE,
	};
	const target = {
		_id: new Types.ObjectId(),
		memberType,
		memberStatus: MemberStatus.ACTIVE,
		agentApprovedAt: new Date(),
	};
	const memberModel = {
		findById: vi.fn(() => ({ lean: () => resolved(target) })),
		findOneAndUpdate: vi.fn(() => ({ lean: () => resolved({ ...target, memberCars: 0 }) })),
	};
	const carService = { countListedCars: vi.fn().mockResolvedValue(listedCars) };
	const testDriveService = { countOpen: vi.fn().mockResolvedValue(openTestDrives) };
	const service = Object.assign(Object.create(MemberService.prototype) as MemberService, {
		memberModel,
		carService,
		testDriveService,
		notificationService: { notify: vi.fn() },
	});
	const change = (to: MemberType) => service.updateMemberByAdmin(admin, { _id: String(target._id), memberType: to });
	return { change, memberModel, testDriveService, target };
}

describe('MemberService.updateMemberByAdmin: USER <-> AGENT', () => {
	it('changes the role of a member with nothing open', async () => {
		const { change, memberModel } = setup(MemberType.USER);
		await change(MemberType.AGENT);
		expect(memberModel.findOneAndUpdate).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ $set: expect.objectContaining({ memberType: MemberType.AGENT }) }),
			expect.anything(),
		);
	});

	it('refuses while an agent still has listed cars', async () => {
		const { change, memberModel } = setup(MemberType.AGENT, { listedCars: 2 });
		await expect(change(MemberType.USER)).rejects.toThrow(Message.MEMBER_TYPE_CHANGE_DENIED);
		expect(memberModel.findOneAndUpdate).not.toHaveBeenCalled();
	});

	it('refuses while a buyer has open test drives, counted as the buyer', async () => {
		const { change, testDriveService, target } = setup(MemberType.USER, { openTestDrives: 1 });
		await expect(change(MemberType.AGENT)).rejects.toThrow(Message.MEMBER_TYPE_CHANGE_DENIED);
		expect(testDriveService.countOpen).toHaveBeenCalledWith({ memberId: target._id });
	});
});

describe('AuthService.authenticate: role changed after the token was issued', () => {
	const memberId = new Types.ObjectId();
	const auth = (tokenType: MemberType, dbType: MemberType) => {
		const service = new AuthService(
			{ verifyAsync: vi.fn().mockResolvedValue({ _id: String(memberId), memberType: tokenType, iat: 0 }) } as never,
			{
				findById: () => ({
					select: () => ({
						lean: () =>
							resolved({ _id: memberId, memberNick: 'x', memberType: dbType, memberStatus: MemberStatus.ACTIVE }),
					}),
				}),
			} as never,
		);
		return service.authenticate('Bearer token');
	};

	it('accepts a token with the current role', async () => {
		await expect(auth(MemberType.USER, MemberType.USER)).resolves.toMatchObject({ memberType: MemberType.USER });
	});

	it('refuses a token with the old role', async () => {
		await expect(auth(MemberType.USER, MemberType.AGENT)).rejects.toThrow(Message.NOT_AUTHENTICATED);
	});
});
