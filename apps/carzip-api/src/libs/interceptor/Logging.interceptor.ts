import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { GqlContextType, GqlExecutionContext } from '@nestjs/graphql';
import { Observable, tap } from 'rxjs';

// never write these to the logs, at any depth of the input
const SECRET_KEYS = ['memberPassword', 'password', 'accessToken', 'token'];
const MAX_LENGTH = 200; // long responses (car lists) are cut, the log is for tracing, not for data

/**
 * Logs every GraphQL operation and REST request:
 *   -> Mutation login {"input":{"memberNick":"sanjar","memberPassword":"***"}}
 *   <- Mutation login 42ms {"_id":"...","memberNick":"sanjar",...}
 *   x  Mutation login 12ms BadRequestException: Wrong nick or password!
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
	private readonly logger = new Logger('Request');

	public intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
		const label = this.label(context);
		if (!label) return next.handle(); // nested field resolver: its parent operation is already logged

		const start = Date.now();
		this.logger.log(`-> ${label.name} ${this.stringify(label.args)}`);

		return next.handle().pipe(
			tap({
				next: (result) => this.logger.log(`<- ${label.name} ${Date.now() - start}ms ${this.stringify(result)}`),
				error: (err) => {
					// ValidationPipe keeps the real reasons in response.message, err.message is just "Bad Request Exception"
					const reasons = err?.getResponse?.()?.message;
					const message = Array.isArray(reasons) ? reasons.join('; ') : err?.message;
					this.logger.warn(`x  ${label.name} ${Date.now() - start}ms ${err?.name ?? 'Error'}: ${message}`);
				},
			}),
		);
	}

	private label(context: ExecutionContext): { name: string; args: unknown } | null {
		if (context.getType<GqlContextType>() === 'graphql') {
			const gqlContext = GqlExecutionContext.create(context);
			const info = gqlContext.getInfo();
			if (info.path.prev) return null; // only top-level Query / Mutation fields
			return { name: `${info.parentType.name} ${info.fieldName}`, args: gqlContext.getArgs() };
		}
		const req = context.switchToHttp().getRequest();
		return { name: `${req.method} ${req.url}`, args: req.body };
	}

	private stringify(value: unknown): string {
		if (value === undefined) return '';
		const text = JSON.stringify(value, (key, v) => (SECRET_KEYS.includes(key) ? '***' : v)) ?? '';
		return text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH)}...` : text;
	}
}
