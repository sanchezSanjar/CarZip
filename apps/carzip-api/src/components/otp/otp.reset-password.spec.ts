import { describe, it, expect, vi } from 'vitest';
import { Types } from 'mongoose';
import { OtpService } from './otp.service';
import { Message } from '@app/common/enums/common.enum';

// a mongoose call chain ending in .exec()
const resolved = <T>(value: T) => ({ exec: vi.fn().mockResolvedValue(value) });

/** OtpService with only what resetPassword() uses; everything is fake, no database or SMS */
function setup({ otpFound = true } = {}) {
	const memberId = new Types.ObjectId();
	const otpModel = { findOneAndUpdate: vi.fn(() => ({ lean: () => resolved(otpFound ? { memberId } : null) })) };
	const memberModel = { updateOne: vi.fn(() => resolved({ matchedCount: 1 })) };
	const authService = {
		hashPassword: vi.fn().mockResolvedValue('new-hash'),
		revokeMemberSessions: vi.fn().mockResolvedValue(undefined),
	};
	const service = Object.assign(Object.create(OtpService.prototype), {
		otpModel,
		memberModel,
		authService,
	}) as OtpService;
	return { service, authService, memberId };
}

describe('OtpService.resetPassword: sessions', () => {
	const input = { resetToken: 'reset-token', newPassword: 'new-secret' };

	it('a reset by SMS ends every refresh-token session of the member', async () => {
		const { service, authService, memberId } = setup();
		await expect(service.resetPassword(input)).resolves.toBe(Message.PASSWORD_RESET_DONE);
		expect(authService.revokeMemberSessions).toHaveBeenCalledWith(memberId);
	});

	it('an invalid reset token changes nothing and ends no session', async () => {
		const { service, authService } = setup({ otpFound: false });
		await expect(service.resetPassword(input)).rejects.toThrow(Message.RESET_TOKEN_INVALID);
		expect(authService.revokeMemberSessions).not.toHaveBeenCalled();
	});
});
