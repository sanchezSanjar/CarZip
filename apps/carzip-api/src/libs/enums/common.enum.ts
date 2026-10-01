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
}
