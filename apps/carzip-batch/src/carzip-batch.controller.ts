import { Controller, Get } from '@nestjs/common';
import { CarzipBatchService } from './carzip-batch.service';

@Controller()
export class CarzipBatchController {
	constructor(private readonly carzipBatchService: CarzipBatchService) {}

	@Get()
	getHello(): string {
		return this.carzipBatchService.getHello();
	}
}
