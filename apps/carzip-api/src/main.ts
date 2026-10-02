import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';
import { LoggingInterceptor } from './libs/interceptor/Logging.interceptor';
import { LocalStorageService } from './components/upload/storage.service';

async function bootstrap() {
	const app = await NestFactory.create<NestExpressApplication>(AppModule);
	app.useGlobalPipes(new ValidationPipe());
	app.useGlobalInterceptors(new LoggingInterceptor());

	// which websites may call the API from a browser: CORS_ORIGINS in .env, comma separated
	// (e.g. https://carzip.kr,https://www.carzip.kr). In development any localhost port is allowed too.
	// Requests without an Origin (mobile app, server-to-server, curl) are not affected by CORS.
	const allowedOrigins = (process.env.CORS_ORIGINS ?? '')
		.split(',')
		.map((origin) => origin.trim())
		.filter(Boolean);
	const isDevelopment = process.env.NODE_ENV !== 'production';
	const isLocalhost = (origin: string) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
	app.enableCors({
		origin: (origin, callback) =>
			callback(null, !origin || allowedOrigins.includes(origin) || (isDevelopment && isLocalhost(origin))),
		credentials: true,
	});

	// uploaded images (local storage). Only files UploadService produced are in here (re-encoded WebP)
	app.useStaticAssets(LocalStorageService.ROOT, {
		prefix: '/uploads/',
		index: false,
		dotfiles: 'deny',
		setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'), // the browser must not guess a type
	});

	// plain WebSockets (the "ws" library) on the same port as the API
	app.useWebSocketAdapter(new WsAdapter(app));

	await app.listen(process.env.PORT_API ?? 3000);
}
bootstrap();
