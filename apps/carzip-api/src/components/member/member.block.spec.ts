import { describe, it, expect, vi } from 'vitest';
import { Types } from 'mongoose';
import { MemberService } from './member.service';
import { MemberStatus, MemberType } from '@app/common/enums/member.enum';

// a mongoose call chain ending in .exec()
const resolved = <T>(value: T) => ({ exec: vi.fn().mockResolvedValue(value) });

/** MemberService with only what updateMemberByAdmin() uses for a status change of a buyer; everything is fake */
function setup() {
	const admin = {
		_id: new Types.ObjectId(),
		memberNick: 'admin',
		memberType: MemberType.ADMIN,
		memberStatus: MemberStatus.ACTIVE,
	};
	const target = { _id: new Types.ObjectId(), memberType: MemberType.USER, memberStatus: MemberStatus.ACTIVE };
	const memberModel = {
		findById: vi.fn(() => ({ lean: () => resolved(target) })),
		findOneAndUpdate: vi.fn(() => ({ lean: () => resolved({ ...target, memberCars: 0 }) })),
	};
	const authService = { revokeMemberSessions: vi.fn().mockResolvedValue(undefined) };
	const testDriveService = { cancelForBuyer: vi.fn().mockResolvedValue(0) };
	const service = Object.assign(Object.create(MemberService.prototype), {
		memberModel,
		authService,
		testDriveService,
		notificationService: { notify: vi.fn() },
	}) as MemberService;
	const setStatus = (memberStatus: MemberStatus) =>
		service.updateMemberByAdmin(admin, { _id: String(target._id), memberStatus });
	return { setStatus, authService, testDriveService, target };
}

describe('MemberService.updateMemberByAdmin: block and delete end the sessions', () => {
	it('BLOCK logs the member out everywhere (refresh tokens and push tokens)', async () => {
		const { setStatus, authService, testDriveService, target } = setup();
		await setStatus(MemberStatus.BLOCK);
		expect(authService.revokeMemberSessions).toHaveBeenCalledWith(target._id);
		expect(testDriveService.cancelForBuyer).toHaveBeenCalled();
	});

	it('DELETE does the same', async () => {
		const { setStatus, authService, target } = setup();
		await setStatus(MemberStatus.DELETE);
		expect(authService.revokeMemberSessions).toHaveBeenCalledWith(target._id);
	});

	it('restoring a member (ACTIVE) ends no session', async () => {
		const { setStatus, authService, testDriveService } = setup();
		await setStatus(MemberStatus.ACTIVE);
		expect(authService.revokeMemberSessions).not.toHaveBeenCalled();
		expect(testDriveService.cancelForBuyer).not.toHaveBeenCalled();
	});
});
