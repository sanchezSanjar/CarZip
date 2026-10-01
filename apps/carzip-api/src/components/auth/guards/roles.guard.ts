import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../auth.service';
import { getRequest } from '../auth.request';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { MemberType } from '../../../libs/enums/member.enum';
import { Message } from '../../../libs/enums/common.enum';

/**
 * Authorization: logged in AND one of the @Roles(...) on the handler. Authenticates by itself,
 * so use it alone: @Roles(MemberType.ADMIN) @UseGuards(RolesGuard)
 */
@Injectable()
export class RolesGuard implements CanActivate {
	constructor(
		private readonly reflector: Reflector,
		private readonly authService: AuthService,
	) {}

	public async canActivate(context: ExecutionContext): Promise<boolean> {
		const roles = this.reflector.getAllAndOverride<MemberType[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
		if (!roles?.length) return true;

		const request = getRequest(context);
		const authMember = await this.authService.authenticate(request.headers.authorization);
		if (!roles.includes(authMember.memberType)) throw new ForbiddenException(Message.ONLY_SPECIFIC_ROLES_ALLOWED);

		request.authMember = authMember;
		return true;
	}
}
