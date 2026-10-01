import { HttpException, HttpStatus, Logger, Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppResolver } from './app.resolver';
import { ConfigModule } from '@nestjs/config';
import { ApolloDriver } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import { unwrapResolverError } from '@apollo/server/errors';
import { GraphQLError, GraphQLFormattedError } from 'graphql';
import { ComponentsModule } from './components/components.module';
import { DatabaseModule } from './database/database.module';
import { Message } from './libs/enums/common.enum';

const logger = new Logger('GraphQLError');

@Module({
	imports: [
		ConfigModule.forRoot(),
		GraphQLModule.forRoot({
			driver: ApolloDriver,
			playground: true,
			uploads: false,
			autoSchemaFile: true,
			/**
			 * Every GraphQL error the API sends goes through here, so clients always get one shape:
			 *   { message, path, extensions: { code, errors? } }
			 * - HttpException (thrown by us or by ValidationPipe) -> its own message(s), safe to show
			 * - GraphQL query errors (bad field, bad enum value)   -> passed through, they describe the client's query
			 * - anything else (DB crash, bug, TypeError)           -> logged in full, client only sees "Something went wrong!"
			 * Stack traces never leave the server.
			 */
			formatError: (formattedError: GraphQLFormattedError, error: unknown): GraphQLFormattedError => {
				let code = (formattedError.extensions?.code as string) ?? 'INTERNAL_SERVER_ERROR';
				const original = unwrapResolverError(error);

				if (original instanceof HttpException) {
					// Apollo only knows a few codes (400, 401, 403...). Others, like 429, would say INTERNAL_SERVER_ERROR
					if (code === 'INTERNAL_SERVER_ERROR' && original.getStatus() !== 500) {
						code = HttpStatus[original.getStatus()] ?? code;
					}
					const response = original.getResponse();
					// ValidationPipe puts every failed rule in response.message as an array
					const raw = typeof response === 'object' ? (response as { message?: string | string[] }).message : response;
					const errors = Array.isArray(raw) ? raw : [raw ?? original.message];
					return {
						message: errors[0],
						path: formattedError.path,
						extensions: { code, ...(errors.length > 1 && { errors }) },
					};
				}

				// the query itself was invalid (syntax, unknown field, bad enum value): the message is about the client's query
				if (original instanceof GraphQLError) {
					return { message: formattedError.message, path: formattedError.path, extensions: { code } };
				}

				logger.error(original instanceof Error ? (original.stack ?? original.message) : String(original));
				return {
					message: Message.SOMETHING_WENT_WRONG,
					path: formattedError.path,
					extensions: { code: 'INTERNAL_SERVER_ERROR' },
				};
			},
		}),
		ComponentsModule,
		DatabaseModule,
	],
	controllers: [AppController],
	providers: [AppService, AppResolver],
})
export class AppModule {}
