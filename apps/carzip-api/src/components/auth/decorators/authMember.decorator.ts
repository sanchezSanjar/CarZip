import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthMemberData } from '../../../libs/types/auth';
import { getRequest } from '../auth.request';

/**
 * The member a guard authenticated: @AuthMember() member, or one field: @AuthMember('_id') memberId.
 * null when there is none (WithoutGuard + guest). Without any guard it is always null:
 * it reads request.authMember, which only guards set — never anything the client sent.
 */
export const AuthMember = createParamDecorator((field: keyof AuthMemberData | undefined, context: ExecutionContext) => {
	const member = getRequest(context).authMember;
	if (!member) return null;
	return field ? member[field] : member;
});
