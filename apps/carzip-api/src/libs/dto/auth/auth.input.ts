import { Field, InputType } from '@nestjs/graphql';
import { IsEnum, IsOptional, Length } from 'class-validator';
import { DevicePlatform } from '@app/common/enums/member.enum';

/**
 * The device logging in (login / signup). With it the member gets a 15-minute access token AND a refresh token;
 * without it, the old 30-day access token (the web today). See API.md §2.
 */
@InputType()
export class DeviceInput {
	/** made by the app once (e.g. a UUID) and kept on the device. The same device logging in again ends its old session */
	@Length(8, 100)
	@Field(() => String)
	deviceId: string;

	/** shown in a future "my devices" list, e.g. "Galaxy S24" */
	@IsOptional()
	@Length(1, 100)
	@Field(() => String, { nullable: true })
	deviceName?: string;

	@IsOptional()
	@IsEnum(DevicePlatform)
	@Field(() => DevicePlatform, { nullable: true })
	devicePlatform?: DevicePlatform;
}
