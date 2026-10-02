import { Field, InputType, Int } from '@nestjs/graphql';
import {
	IsEmail,
	IsIn,
	IsNotEmpty,
	IsOptional,
	IsUrl,
	Length,
	Matches,
	Max,
	Min,
	ValidateIf,
	ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MemberAuthType, MemberStatus, MemberType } from '@app/common/enums/member.enum';
import { Satisfies } from '../../validators/satisfies';
import { availableAgentSorts, availableMemberSorts } from '../../config';
import { Direction, Message } from '@app/common/enums/common.enum';

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

@InputType()
class AISearch {
	/** matches nick or company name, case-insensitive */
	@IsOptional()
	@Length(1, 50)
	@Field(() => String, { nullable: true })
	text?: string;
}

/** getAgents input: page-based list of ACTIVE (approved) agents */
@InputType()
export class AgentsInquiry {
	@Min(1)
	@Field(() => Int)
	page: number;

	@Min(1)
	@Max(100)
	@Field(() => Int)
	limit: number;

	@IsOptional()
	@IsIn(availableAgentSorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@IsIn([Direction.ASC, Direction.DESC])
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsOptional()
	@ValidateNested() // without it nothing inside search is validated
	@Type(() => AISearch)
	@Field(() => AISearch, { nullable: true })
	search?: AISearch;
}

@InputType()
class MISearch {
	@IsOptional()
	@IsIn(Object.values(MemberStatus))
	@Field(() => MemberStatus, { nullable: true })
	memberStatus?: MemberStatus;

	@IsOptional()
	@IsIn(Object.values(MemberType))
	@Field(() => MemberType, { nullable: true })
	memberType?: MemberType;

	/** matches nick, company or phone, case-insensitive */
	@IsOptional()
	@Length(1, 50)
	@Field(() => String, { nullable: true })
	text?: string;
}

/**
 * getAllMembersByAdmin input. "Agent applications, oldest first" =
 * { search: { memberType: AGENT, memberStatus: PENDING }, sort: "createdAt", direction: ASC }
 */
@InputType()
export class MembersInquiry {
	@Min(1)
	@Field(() => Int)
	page: number;

	@Min(1)
	@Max(100)
	@Field(() => Int)
	limit: number;

	@IsOptional()
	@IsIn(availableMemberSorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@IsIn([Direction.ASC, Direction.DESC])
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsOptional()
	@ValidateNested() // without it nothing inside search is validated
	@Type(() => MISearch)
	@Field(() => MISearch, { nullable: true })
	search?: MISearch;
}

/** changePassword input (logged in). Forgot the password? That is resetPassword, with an SMS code. */
@InputType()
export class ChangePasswordInput {
	@Length(6, 30)
	@Field(() => String)
	oldPassword: string;

	@Length(6, 30)
	@Satisfies<ChangePasswordInput>((o, v) => v !== o.oldPassword, Message.SAME_PASSWORD)
	@Field(() => String)
	newPassword: string;
}

/**
 * changeMemberPhone input (logged in), the last of 3 steps:
 * 1. requestOtp(otpPhone: newPhone, otpPurpose: CHANGE_PHONE)  2. verifyOtp(... code)  3. this
 * The current password is required too: a stolen session alone can't move the account to another phone.
 */
@InputType()
export class ChangePhoneInput {
	@Matches(PHONE_REGEX, { message: 'Phone must look like 01012345678' })
	@Field(() => String)
	newPhone: string;

	@Length(6, 30)
	@Field(() => String)
	memberPassword: string;
}
