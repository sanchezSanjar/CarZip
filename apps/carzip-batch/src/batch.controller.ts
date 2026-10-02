import { Controller, Get, Logger } from '@nestjs/common';
import { Cron, Timeout } from '@nestjs/schedule';
import { BatchService } from './batch.service';
import { BATCH_ROLLBACK, BATCH_TIMEZONE, BATCH_TOP_AGENTS, BATCH_TOP_CARS } from './libs/config';

/**
 * Scheduled jobs. Cron format: second minute hour day month weekday.
 * Every night at 01:00 (Korea time) they run one after another (rollback :00, cars :20, agents :40),
 * so the rankings are reset before they are recalculated. A failing job is logged and never stops the others.
 */
@Controller()
export class BatchController {
	private readonly logger = new Logger('BatchController');

	constructor(private readonly batchService: BatchService) {}

	@Timeout(1000)
	public handleTimeout(): void {
		this.logger.log('BATCH SERVER IS READY');
	}

	@Cron('00 00 01 * * *', { name: BATCH_ROLLBACK, timeZone: BATCH_TIMEZONE })
	public async batchRollback(): Promise<void> {
		await this.run(BATCH_ROLLBACK, () => this.batchService.batchRollback());
	}

	@Cron('20 00 01 * * *', { name: BATCH_TOP_CARS, timeZone: BATCH_TIMEZONE })
	public async batchTopCars(): Promise<void> {
		await this.run(BATCH_TOP_CARS, () => this.batchService.batchTopCars());
	}

	@Cron('40 00 01 * * *', { name: BATCH_TOP_AGENTS, timeZone: BATCH_TIMEZONE })
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
