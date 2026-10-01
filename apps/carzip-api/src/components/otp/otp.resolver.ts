import { UseGuards } from '@nestjs/common';
import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';
import type { Request } from 'express';
import { OtpService } from './otp.service';
import { RequestOtpInput, ResetPasswordInput, VerifyOtpInput } from '../../libs/dto/otp/otp.input';
import { VerifyOtpResult } from '../../libs/dto/otp/otp';
import { WithoutGuard } from '../auth/guards/without.guard';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { AuthMemberData } from '../../libs/types/auth';

/**
 * SIGNUP and RESET_PASSWORD are used while logged out, CHANGE_PHONE while logged in.
 * WithoutGuard: everyone passes, and a valid token tells the service WHO asked (needed for CHANGE_PHONE).
 */
@Resolver()
export class OtpResolver {
	constructor(private readonly otpService: OtpService) {}

	@UseGuards(WithoutGuard)
	@Mutation(() => String)
	public async requestOtp(
		@Args('input') input: RequestOtpInput,
		@Context('req') req: Request,
		@AuthMember() authMember: AuthMemberData | null,
	): Promise<string> {
		return this.otpService.requestOtp(input, req.ip ?? 'unknown', authMember);
	}

	@UseGuards(WithoutGuard)
	@Mutation(() => VerifyOtpResult)
	public async verifyOtp(
		@Args('input') input: VerifyOtpInput,
		@AuthMember() authMember: AuthMemberData | null,
	): Promise<VerifyOtpResult> {
		return this.otpService.verifyOtp(input, authMember);
	}

	@Mutation(() => String)
	public async resetPassword(@Args('input') input: ResetPasswordInput): Promise<string> {
		return this.otpService.resetPassword(input);
	}
}
