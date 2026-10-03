import { describe, it, expect, vi } from 'vitest';
import { HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { MemberService } from './member.service';
import { Message } from '@app/common/enums/common.enum';
import { MemberStatus, MemberType } from '@app/common/enums/member.enum';

// a mongoose call chain ending in .exec()
const resolved = <T>(value: T) => ({ exec: vi.fn().mockResolvedValue(value) });

const activeMember = {
	_id: 'm1',
	memberNick: 'cz_buyer',
	memberType: MemberType.USER,
	memberStatus: MemberStatus.ACTIVE,
	memberPassword: 'hash',
};

/** MemberService with only what login() uses; everything is fake, no database */
function setup({
	accountFailures = 0,
	ipFailures = 0,
	member = activeMember as object | null,
	passwordOk = false,
} = {}) {
	const loginAttemptModel = {
		// the account count asks by loginKey, the IP count by loginIp
		countDocuments: vi.fn((query: Record<string, unknown>) =>
			resolved('loginKey' in query ? accountFailures : ipFailures),
		),
		create: vi.fn().mockResolvedValue({}),
		deleteMany: vi.fn(() => resolved({ deletedCount: accountFailures })),
	};
	const memberModel = {
		findOne: vi.fn(() => ({ select: () => ({ lean: () => resolved(member) }) })),
	};
	const authService = {
		comparePassword: vi.fn().mockResolvedValue(passwordOk),
		createToken: vi.fn().mockResolvedValue('new-token'),
	};
	const service = Object.assign(Object.create(MemberService.prototype) as MemberService, {
		loginAttemptModel,
		memberModel,
		authService,
	});
	return { service, loginAttemptModel, authService };
}

describe('MemberService.login: limit on failed logins', () => {
	const input = { memberNick: 'CZ_Buyer', memberPassword: 'wrong' };

	it('a wrong password is refused and counted for that account and IP', async () => {
		const { service, loginAttemptModel } = setup();
		await expect(service.login(input, '1.2.3.4')).rejects.toThrow(new UnauthorizedException(Message.WRONG_LOGIN));
		// the nickname is compared lower-cased, so "CZ_Buyer" and "cz_buyer" share one counter
		expect(loginAttemptModel.create).toHaveBeenCalledWith({ loginKey: 'cz_buyer', loginIp: '1.2.3.4' });
	});

	it('an unknown nickname counts as a failure too (same message, nothing revealed)', async () => {
		const { service, loginAttemptModel } = setup({ member: null });
		await expect(service.login(input, '1.2.3.4')).rejects.toThrow(Message.WRONG_LOGIN);
		expect(loginAttemptModel.create).toHaveBeenCalledTimes(1);
	});

	it('after 5 failures for the account, even the right password is refused for now', async () => {
		const { service, authService } = setup({ accountFailures: 5, passwordOk: true });
		const error = await service.login(input, '1.2.3.4').catch((e: unknown) => e);
		expect(error).toBeInstanceOf(HttpException);
		expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
		expect((error as HttpException).message).toBe(Message.LOGIN_TOO_MANY);
		expect(authService.comparePassword).not.toHaveBeenCalled(); // no password guessing while locked
	});

	it('30 failures from one IP stop that IP from trying other accounts', async () => {
		const { service } = setup({ ipFailures: 30 });
		await expect(service.login(input, '1.2.3.4')).rejects.toThrow(Message.LOGIN_TOO_MANY);
	});

	it('4 failures still allow a try, and the right password clears the account counter', async () => {
		const { service, loginAttemptModel } = setup({ accountFailures: 4, passwordOk: true });
		const member = await service.login({ ...input, memberPassword: 'right' }, '1.2.3.4');
		expect(member.accessToken).toBe('new-token');
		expect(loginAttemptModel.deleteMany).toHaveBeenCalledWith({ loginKey: 'cz_buyer' });
		expect(loginAttemptModel.create).not.toHaveBeenCalled();
	});
});
