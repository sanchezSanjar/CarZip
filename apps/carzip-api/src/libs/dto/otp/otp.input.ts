import { Field, InputType } from '@nestjs/graphql';
import { IsIn, IsNotEmpty, Length, Matches } from 'class-validator';
import { OtpPurpose } from '@app/common/enums/otp.enum';

// Korean mobile number, digits only: 010xxxxxxxx
const PHONE_REGEX = /^01[016789]\d{7,8}$/;
// SIGNUP and RESET_PASSWORD: logged out. CHANGE_PHONE: logged in, otpPhone = the NEW number
const SUPPORTED_PURPOSES = [OtpPurpose.SIGNUP, OtpPurpose.RESET_PASSWORD, OtpPurpose.CHANGE_PHONE];

@InputType()
export class RequestOtpInput {
	@Matches(PHONE_REGEX, { message: 'Phone must look like 01012345678' })
	@Field(() => String)
	otpPhone: string;

	@IsIn(SUPPORTED_PURPOSES)
	@Field(() => OtpPurpose)
	otpPurpose: OtpPurpose;
}

@InputType()
export class VerifyOtpInput extends RequestOtpInput {
	@Matches(/^\d{6}$/, { message: 'The code is 6 digits' })
	@Field(() => String)
	otpCode: string;
}

@InputType()
export class ResetPasswordInput {
	@IsNotEmpty()
	@Field(() => String)
	resetToken: string;

	@IsNotEmpty()
	@Length(6, 30)
	@Field(() => String)
	newPassword: string;
}
