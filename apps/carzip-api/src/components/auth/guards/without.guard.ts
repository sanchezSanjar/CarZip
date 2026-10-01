import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { getRequest } from '../auth.request';

/**
 * Optional login: everyone passes. A valid token gives @AuthMember() the member, otherwise it is null.
 * For public pages that look different when logged in (e.g. "did I like this car?").
 */
@Injectable()
export class WithoutGuard implements CanActivate {
	constructor(private readonly authService: AuthService) {}

	public async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = getRequest(context);
		try {
			request.authMember = await this.authService.authenticate(request.headers.authorization);
		} catch {
			request.authMember = null; // no token, bad token, blocked: just a guest here
		}
		return true;
	}
}
