import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { LoggingInterceptor } from './libs/interceptor/Logging.interceptor';
import { LocalStorageService } from './components/upload/storage.service';

async function bootstrap() {
	const app = await NestFactory.create<NestExpressApplication>(AppModule);
	app.useGlobalPipes(new ValidationPipe());
	app.useGlobalInterceptors(new LoggingInterceptor());

	// uploaded images (local storage). Only files UploadService produced are in here (re-encoded WebP)
	app.useStaticAssets(LocalStorageService.ROOT, {
		prefix: '/uploads/',
		index: false,
		dotfiles: 'deny',
		setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'), // the browser must not guess a type
	});

	await app.listen(process.env.PORT_API ?? 3000);
}
bootstrap();
