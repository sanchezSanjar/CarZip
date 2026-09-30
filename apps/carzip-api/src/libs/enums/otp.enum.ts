import { registerEnumType } from '@nestjs/graphql';

export enum OtpPurpose {
	SIGNUP = 'SIGNUP',
	RESET_PASSWORD = 'RESET_PASSWORD',
	CHANGE_PHONE = 'CHANGE_PHONE',
}
registerEnumType(OtpPurpose, { name: 'OtpPurpose' });

export enum OtpStatus {
	PENDING = 'PENDING',
	VERIFIED = 'VERIFIED',
	USED = 'USED',
	EXPIRED = 'EXPIRED',
}
registerEnumType(OtpStatus, { name: 'OtpStatus' });
