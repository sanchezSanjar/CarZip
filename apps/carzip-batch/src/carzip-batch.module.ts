import { Module } from '@nestjs/common';
import { CarzipBatchController } from './carzip-batch.controller';
import { CarzipBatchService } from './carzip-batch.service';

@Module({
  imports: [],
  controllers: [CarzipBatchController],
  providers: [CarzipBatchService],
})
export class CarzipBatchModule {}
