import { Field, ObjectType } from '@nestjs/graphql';

/** refreshTokens result: replace BOTH stored tokens, the old refresh token never works again */
@ObjectType()
export class AuthTokens {
	/** JWT for "Authorization: Bearer <token>", valid 15 minutes */
	@Field(() => String) accessToken: string;
	/** for the next refreshTokens call, valid 60 days. Keep it in secure storage */
	@Field(() => String) refreshToken: string;
}
