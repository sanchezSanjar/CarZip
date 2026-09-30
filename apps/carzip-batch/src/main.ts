import { NestFactory } from '@nestjs/core';
import { CarzipBatchModule } from './carzip-batch.module';

async function bootstrap() {
	const app = await NestFactory.create(CarzipBatchModule);
	await app.listen(process.env.PORT_BATCH ?? 3000);
}
bootstrap();
