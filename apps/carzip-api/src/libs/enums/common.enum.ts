import { registerEnumType } from '@nestjs/graphql';

export enum Direction {
	ASC = 1,
	DESC = -1,
}
registerEnumType(Direction, { name: 'Direction' });

/** error messages shared by all services, so web and mobile can match on them */
export enum Message {
	SOMETHING_WENT_WRONG = 'Something went wrong!',
	CREATE_FAILED = 'Create failed!',
	USED_NICK = 'This nick is already taken!',
	USED_PHONE = 'This phone number is already registered!',
	USED_BUSINESS_NO = 'This business number is already registered!',
	WRONG_LOGIN = 'Wrong nick or password!',
	BLOCKED_MEMBER = 'Your account has been blocked. Contact support.',
	TOKEN_NOT_EXIST = 'Bearer token is not provided!',
	NOT_AUTHENTICATED = 'You are not authenticated, please login first!',
	ONLY_SPECIFIC_ROLES_ALLOWED = 'Allowed only for members with specific roles!',
	AGENT_UNDER_REVIEW = 'Your agent account is under review. Usually within 24 hours.',
	AGENT_REJECTED = 'Your agent application was rejected',
	ACCOUNT_UNAVAILABLE = 'This account is no longer available.',
	SMS_FAILED = 'Could not send SMS. Please try again later.',
	OTP_TOO_MANY_REQUESTS = 'Too many code requests. Please try again later.',
	OTP_WAIT_BEFORE_RESEND = 'Please wait a minute before requesting a new code.',
	OTP_SENT = 'Verification code has been sent.',
	OTP_SENT_IF_REGISTERED = 'If this number is registered, a code has been sent.',
	OTP_EXPIRED = 'The code has expired. Please request a new one.',
	OTP_WRONG_CODE = 'Wrong code',
	OTP_VERIFIED = 'Phone number verified.',
	PHONE_NOT_VERIFIED = 'Please verify your phone number first.',
	RESET_TOKEN_INVALID = 'Invalid or expired reset token. Please start over.',
	PASSWORD_RESET_DONE = 'Password has been changed. Please log in again.',
	UPDATE_FAILED = 'Update failed!',
	NOTHING_TO_UPDATE = 'Nothing to update.',
	NO_DATA_FOUND = 'No data found!',
	INVALID_ID = 'Invalid id!',
}
