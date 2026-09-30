import { Field, InputType } from '@nestjs/graphql';
import { IsIn, IsNotEmpty, IsOptional, IsUrl, Length, Matches, ValidateIf } from 'class-validator';
import { MemberAuthType, MemberType } from '../../enums/member.enum';

// Korean mobile number, digits only: 010xxxxxxxx
const PHONE_REGEX = /^01[016789]\d{7,8}$/;
// 사업자등록번호: 123-45-67890 (dashes optional)
const BUSINESS_NO_REGEX = /^\d{3}-?\d{2}-?\d{5}$/;
const NICK_REGEX = /^[a-zA-Z0-9_]+$/;

/** signup mutation input. ADMIN can never be chosen here: admins are created by hand. */
@InputType()
export class MemberInput {
	@IsNotEmpty()
	@Length(3, 12)
	@Matches(NICK_REGEX, {
		message: 'Nick can contain only letters, numbers and _',
	})
	@Field(() => String)
	memberNick: string;

	@IsNotEmpty()
	@Length(6, 30)
	@Field(() => String)
	memberPassword: string;

	@IsNotEmpty()
	@Matches(PHONE_REGEX, { message: 'Phone must look like 01012345678' })
	@Field(() => String)
	memberPhone: string;

	@IsOptional()
	@IsIn([MemberType.USER, MemberType.AGENT])
	@Field(() => MemberType, { nullable: true, defaultValue: MemberType.USER })
	memberType?: MemberType;

	@IsOptional()
	@IsIn(Object.values(MemberAuthType))
	@Field(() => MemberAuthType, {
		nullable: true,
		defaultValue: MemberAuthType.PHONE,
	})
	memberAuthType?: MemberAuthType;

	// ---- AGENT only: checked by an admin before approval
	@ValidateIf((o: MemberInput) => o.memberType === MemberType.AGENT)
	@IsNotEmpty()
	@Length(2, 100)
	@Field(() => String, { nullable: true })
	agentCompany?: string;

	// TODO(prod): make agentBusinessNo and agentBusinessCard required for AGENT signup
	@IsOptional()
	@Matches(BUSINESS_NO_REGEX, {
		message: 'Business number must look like 123-45-67890',
	})
	@Field(() => String, { nullable: true })
	agentBusinessNo?: string;

	@IsOptional()
	@IsUrl()
	@Field(() => String, { nullable: true })
	agentBusinessCard?: string;
}

@InputType()
export class LoginInput {
	@IsNotEmpty()
	@Length(3, 12)
	@Field(() => String)
	memberNick: string;

	@IsNotEmpty()
	@Length(6, 30)
	@Field(() => String)
	memberPassword: string;
}
