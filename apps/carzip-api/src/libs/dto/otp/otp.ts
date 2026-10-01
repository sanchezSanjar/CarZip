import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class VerifyOtpResult {
	@Field(() => String) message: string;

	/** RESET_PASSWORD only: one-time token for resetPassword, valid 10 minutes. Never stored in plain text. */
	@Field(() => String, { nullable: true }) resetToken?: string;
}
