import { describe, it, expect } from 'vitest';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginInput, MemberInput } from './member.input';
import { MemberType } from '@app/common/enums/member.enum';

/** the fields that failed validation (what the ValidationPipe would refuse) */
const failedFields = async (plain: object) =>
	(await validate(plainToInstance(MemberInput, plain))).map((error) => error.property);

const base = { memberNick: 'new_dealer', memberPassword: 'carzip1234', memberPhone: '01012345678' };

describe('MemberInput: signup rules', () => {
	it('a dealer must give a business registration number', async () => {
		expect(await failedFields({ ...base, memberType: MemberType.AGENT, agentCompany: 'Test Motors' })).toContain(
			'agentBusinessNo',
		);
	});

	it('a dealer with a valid business number passes', async () => {
		const fields = await failedFields({
			...base,
			memberType: MemberType.AGENT,
			agentCompany: 'Test Motors',
			agentBusinessNo: '123-45-67890',
		});
		expect(fields).toEqual([]);
	});

	it('a badly written business number is refused', async () => {
		const fields = await failedFields({
			...base,
			memberType: MemberType.AGENT,
			agentCompany: 'Test Motors',
			agentBusinessNo: '12345',
		});
		expect(fields).toContain('agentBusinessNo');
	});

	it("a buyer doesn't need a business number, but needs a full name", async () => {
		expect(await failedFields({ ...base, memberType: MemberType.USER, memberFullName: 'Kim Minji' })).toEqual([]);
		expect(await failedFields({ ...base, memberType: MemberType.USER })).toContain('memberFullName');
	});

	it('a dealer must give a company name', async () => {
		expect(await failedFields({ ...base, memberType: MemberType.AGENT, agentBusinessNo: '123-45-67890' })).toContain(
			'agentCompany',
		);
	});
});

describe('LoginInput: the device for refresh tokens', () => {
	// the app's own ValidationPipe, as it checks every GraphQL input
	const pipe = new ValidationPipe();
	const check = (value: object) => pipe.transform(value, { type: 'body', metatype: LoginInput });
	const login = { memberNick: 'cz_buyer', memberPassword: 'carzip1234' };

	it('the web logs in without a device', async () => {
		await expect(check(login)).resolves.toEqual(login); // passed through unchanged, not refused
	});

	it('the app logs in with a device', async () => {
		const device = { deviceId: 'b3f1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d', devicePlatform: 'ANDROID' };
		await expect(check({ ...login, device })).resolves.toMatchObject({ device });
	});

	it('a device is checked too: a too short deviceId or an unknown platform is refused', async () => {
		await expect(check({ ...login, device: { deviceId: 'short' } })).rejects.toThrow(BadRequestException);
		await expect(check({ ...login, device: { deviceId: 'long-enough-id', devicePlatform: 'NOKIA' } })).rejects.toThrow(
			BadRequestException,
		);
	});
});
