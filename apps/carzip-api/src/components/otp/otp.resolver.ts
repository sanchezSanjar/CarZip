import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';
import type { Request } from 'express';
import { OtpService } from './otp.service';
import { RequestOtpInput, ResetPasswordInput, VerifyOtpInput } from '../../libs/dto/otp/otp.input';
import { VerifyOtpResult } from '../../libs/dto/otp/otp';

/** public: used before signup and when the password is forgotten, so no guards */
@Resolver()
export class OtpResolver {
	constructor(private readonly otpService: OtpService) {}

	@Mutation(() => String)
	public async requestOtp(@Args('input') input: RequestOtpInput, @Context('req') req: Request): Promise<string> {
		return this.otpService.requestOtp(input, req.ip ?? 'unknown');
	}

	@Mutation(() => VerifyOtpResult)
	public async verifyOtp(@Args('input') input: VerifyOtpInput): Promise<VerifyOtpResult> {
		return this.otpService.verifyOtp(input);
	}

	@Mutation(() => String)
	public async resetPassword(@Args('input') input: ResetPasswordInput): Promise<string> {
		return this.otpService.resetPassword(input);
	}
}
