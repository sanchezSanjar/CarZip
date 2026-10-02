import { Controller, Get, Logger } from '@nestjs/common';
import { Cron, Timeout } from '@nestjs/schedule';
import { BatchService } from './batch.service';
import { BATCH_ROLLBACK, BATCH_TOP_AGENTS, BATCH_TOP_CARS } from './libs/config';

/**
 * Scheduled jobs. Cron format: second minute hour day month weekday.
 * They run one after another inside each minute (rollback :00, cars :20, agents :40), so the rankings
 * are reset before they are recalculated. A failing job is logged and never stops the others.
 */
@Controller()
export class BatchController {
	private readonly logger = new Logger('BatchController');

	constructor(private readonly batchService: BatchService) {}

	@Timeout(1000)
	public handleTimeout(): void {
		this.logger.log('BATCH SERVER IS READY');
	}

	@Cron('00 * * * * *', { name: BATCH_ROLLBACK })
	public async batchRollback(): Promise<void> {
		await this.run(BATCH_ROLLBACK, () => this.batchService.batchRollback());
	}

	@Cron('20 * * * * *', { name: BATCH_TOP_CARS })
	public async batchTopCars(): Promise<void> {
		await this.run(BATCH_TOP_CARS, () => this.batchService.batchTopCars());
	}

	@Cron('40 * * * * *', { name: BATCH_TOP_AGENTS })
	public async batchTopAgents(): Promise<void> {
		await this.run(BATCH_TOP_AGENTS, () => this.batchService.batchTopAgents());
	}

	@Get()
	public getHello(): string {
		return this.batchService.getHello();
	}

	/** one job: log it, run it, and keep the scheduler alive if it throws */
	private async run(name: string, job: () => Promise<void>): Promise<void> {
		const started = Date.now();
		try {
			await job();
			this.logger.log(`${name} done in ${Date.now() - started}ms`);
		} catch (err: any) {
			this.logger.error(`${name} failed: ${err?.message ?? err}`);
		}
	}
}
