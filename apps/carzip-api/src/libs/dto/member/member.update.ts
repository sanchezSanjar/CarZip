import { Field, InputType } from '@nestjs/graphql';
import { IsEmail, IsOptional, Length, Matches, ValidateIf } from 'class-validator';
import { CONTACT_PHONE_REGEX, NICK_REGEX } from './member.input';

/**
 * updateMember input: what a member may change about THEMSELF. Every field is optional.
 * Deliberately NOT here (a member must never set them on their own account):
 * - _id: always the logged-in member, from the JWT
 * - memberType / memberStatus: would let anyone become ADMIN or unblock themself (admin-only)
 * - memberPhone: changed through CHANGE_PHONE OTP, so the new number is verified
 * - memberPassword: needs hashing and the old password, gets its own mutation
 * - agentCompany / agentBusinessNo / agentBusinessCard: verified by an admin, locked after approval
 */
@InputType()
export class MemberUpdate {
	@IsOptional()
	@Length(3, 12)
	@Matches(NICK_REGEX, { message: 'Nick can contain only letters, numbers and _' })
	@Field(() => String, { nullable: true })
	memberNick?: string;

	@IsOptional()
	@Length(2, 50)
	@Field(() => String, { nullable: true })
	memberFullName?: string;

	@IsOptional()
	@Length(0, 300)
	@Field(() => String, { nullable: true })
	memberImage?: string;

	@IsOptional()
	@Length(0, 200)
	@Field(() => String, { nullable: true })
	memberAddress?: string;

	@IsOptional()
	@Length(0, 500)
	@Field(() => String, { nullable: true })
	memberDesc?: string;

	// ---- AGENT only: public contacts. Send "" to remove one. Ignored for USER.
	@ValidateIf((o: MemberUpdate) => !!o.contactPhone)
	@Matches(CONTACT_PHONE_REGEX, { message: 'Contact phone must be a phone number' })
	@Field(() => String, { nullable: true })
	contactPhone?: string;

	@ValidateIf((o: MemberUpdate) => !!o.contactEmail)
	@IsEmail()
	@Field(() => String, { nullable: true })
	contactEmail?: string;

	@ValidateIf((o: MemberUpdate) => !!o.contactTelegram)
	@Length(2, 50)
	@Field(() => String, { nullable: true })
	contactTelegram?: string;

	@ValidateIf((o: MemberUpdate) => !!o.contactWhatsapp)
	@Matches(CONTACT_PHONE_REGEX, { message: 'WhatsApp must be a phone number' })
	@Field(() => String, { nullable: true })
	contactWhatsapp?: string;

	@ValidateIf((o: MemberUpdate) => !!o.contactKakao)
	@Length(2, 50)
	@Field(() => String, { nullable: true })
	contactKakao?: string;
}
