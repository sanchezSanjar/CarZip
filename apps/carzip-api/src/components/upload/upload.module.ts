import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { LocalStorageService, StorageService } from './storage.service';
import { AuthModule } from '../auth/auth.module';

@Module({
	imports: [AuthModule], // AuthGuard on the controller
	controllers: [UploadController],
	providers: [
		UploadService,
		// swap useClass for an object-storage implementation (S3 / R2 / NCP) when going to production
		{ provide: StorageService, useClass: LocalStorageService },
	],
	exports: [UploadService],
})
export class UploadModule {}
