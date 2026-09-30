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
}
