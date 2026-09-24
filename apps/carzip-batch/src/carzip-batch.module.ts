import { Module } from '@nestjs/common';
import { CarzipBatchController } from './carzip-batch.controller';
import { CarzipBatchService } from './carzip-batch.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule.forRoot()],
  controllers: [CarzipBatchController],
  providers: [CarzipBatchService],
})
export class CarzipBatchModule {}
