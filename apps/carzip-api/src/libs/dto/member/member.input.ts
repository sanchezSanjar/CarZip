import { Field, InputType } from '@nestjs/graphql';
import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsUrl, Length, Matches, ValidateIf } from 'class-validator';
import { MemberAuthType, MemberType } from '../../enums/member.enum';
import { Satisfies } from '../../validators/satisfies';

// Korean mobile number, digits only: 010xxxxxxxx
export const PHONE_REGEX = /^01[016789]\d{7,8}$/;
// 사업자등록번호: 123-45-67890 (dashes optional)
const BUSINESS_NO_REGEX = /^\d{3}-?\d{2}-?\d{5}$/;
export const NICK_REGEX = /^[a-zA-Z0-9_]+$/;
// public contact numbers: mobile, landline (02-123-4567) or international (+82 10 ...)
export const CONTACT_PHONE_REGEX = /^\+?[0-9\s()-]{7,20}$/;

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

	/** required for USER (signup form: nick, password, full name), optional for AGENT */
	@ValidateIf((o: MemberInput) => o.memberType !== MemberType.AGENT || o.memberFullName != null)
	@Length(2, 50)
	@IsNotEmpty()
	@Field(() => String, { nullable: true })
	memberFullName?: string;

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

	// ---- AGENT only: PUBLIC contacts shown on listings, buyers reach the agent outside CarZip
	@IsOptional()
	@Matches(CONTACT_PHONE_REGEX, { message: 'Contact phone must be a phone number' })
	@Field(() => String, { nullable: true })
	contactPhone?: string;

	@IsOptional()
	@IsEmail()
	@Field(() => String, { nullable: true })
	contactEmail?: string;

	@IsOptional()
	@Length(2, 50)
	@Field(() => String, { nullable: true })
	contactTelegram?: string;

	@IsOptional()
	@Matches(CONTACT_PHONE_REGEX, { message: 'WhatsApp must be a phone number' })
	@Field(() => String, { nullable: true })
	contactWhatsapp?: string;

	@IsOptional()
	@Length(2, 50)
	@Field(() => String, { nullable: true })
	contactKakao?: string;
}

/** login with nick OR phone (exactly one of them) + password */
@InputType()
export class LoginInput {
	@ValidateIf((o: LoginInput) => o.memberNick != null || o.memberPhone == null)
	@Length(3, 12)
	@IsNotEmpty({ message: 'Enter your nick or phone number' })
	@Field(() => String, { nullable: true })
	memberNick?: string;

	@ValidateIf((o: LoginInput) => o.memberPhone != null)
	@Matches(PHONE_REGEX, { message: 'Phone must look like 01012345678' })
	@Satisfies<LoginInput>((o) => o.memberNick == null, 'Login with nick or phone, not both')
	@Field(() => String, { nullable: true })
	memberPhone?: string;

	@IsNotEmpty()
	@Length(6, 30)
	@Field(() => String)
	memberPassword: string;
}
