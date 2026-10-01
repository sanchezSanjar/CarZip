import { ExecutionContext } from '@nestjs/common';
import { GqlContextType, GqlExecutionContext } from '@nestjs/graphql';
import { AuthRequest } from '../../libs/types/auth';

/** the Express request behind a GraphQL resolver or a REST controller */
export function getRequest(context: ExecutionContext): AuthRequest {
	if (context.getType<GqlContextType>() === 'graphql') {
		return GqlExecutionContext.create(context).getContext().req;
	}
	return context.switchToHttp().getRequest();
}
