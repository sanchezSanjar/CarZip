import { IsNotEmpty, Length, Matches } from 'class-validator';

// Korean mobile number: 01012345678 or 010-1234-5678
const PHONE_REGEX = /^01[016789]-?\d{3,4}-?\d{4}$/;

/** body of POST /sms/test */
export class SendSmsInput {
	@IsNotEmpty()
	@Matches(PHONE_REGEX, { message: 'to must be a Korean mobile number like 01012345678' })
	to: string;

	// 90 bytes = one short SMS. Korean is 2 bytes/char, so keep test texts short; longer becomes LMS (pricier)
	@IsNotEmpty()
	@Length(1, 45)
	text: string;
}
