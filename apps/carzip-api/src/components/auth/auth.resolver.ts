import { UseGuards } from '@nestjs/common';
import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';
import type { Request } from 'express';
import { Types } from 'mongoose';
import { AuthService } from './auth.service';
import { AuthGuard } from './guards/auth.guard';
import { AuthMember } from './decorators/authMember.decorator';
import { AuthTokens } from '../../libs/dto/auth/auth';
import { PushTokenInput } from '../../libs/dto/auth/auth.input';
import { AuthMemberData } from '../../libs/types/auth';
import { PushService } from '@app/common/push/push.service';

/** refresh-token sessions of devices that logged in with a device (API.md §2) */
@Resolver()
export class AuthResolver {
	constructor(
		private readonly authService: AuthService,
		private readonly push: PushService,
	) {}

	// Public: the refresh token itself is the proof. Returns a new pair; the sent refresh token never works again
	@Mutation(() => AuthTokens)
	public async refreshTokens(
		@Args('refreshToken') refreshToken: string,
		@Context('req') req: Request,
	): Promise<AuthTokens> {
		return this.authService.refreshSession(refreshToken, req.ip);
	}

	// Public: ends this device's session. Always true, also for an unknown or already ended token
	@Mutation(() => Boolean)
	public async logout(@Args('refreshToken') refreshToken: string): Promise<boolean> {
		await this.authService.logout(refreshToken);
		return true;
	}

	// Authenticated: this phone gets push notifications for the logged-in member (until this session logs out)
	@UseGuards(AuthGuard)
	@Mutation(() => Boolean)
	public async registerPushToken(
		@Args('input') input: PushTokenInput,
		@AuthMember() me: AuthMemberData,
	): Promise<boolean> {
		await this.push.register(me._id, input.token, me.sessionId, input.devicePlatform);
		return true;
	}

	// Public: the phone turned notifications off. Always true
	@Mutation(() => Boolean)
	public async unregisterPushToken(@Args('token') token: string): Promise<boolean> {
		await this.push.unregister(token);
		return true;
	}

	// Authenticated: every device and browser of this member is logged out, this one too
	@UseGuards(AuthGuard)
	@Mutation(() => Boolean)
	public async logoutAll(@AuthMember('_id') memberId: Types.ObjectId): Promise<boolean> {
		await this.authService.logoutAll(memberId);
		return true;
	}
}
