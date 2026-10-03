import { describe, it, expect } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MemberInput } from './member.input';
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
