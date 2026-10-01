import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { getRequest } from '../auth.request';

/** Authentication: only logged-in members pass. @AuthMember() then gives the member. */
@Injectable()
export class AuthGuard implements CanActivate {
	constructor(private readonly authService: AuthService) {}

	public async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = getRequest(context);
		request.authMember = await this.authService.authenticate(request.headers.authorization);
		return true;
	}
}
