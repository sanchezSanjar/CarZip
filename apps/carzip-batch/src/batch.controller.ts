import { Controller, Get, Logger } from '@nestjs/common';
import { Cron, Timeout } from '@nestjs/schedule';
import { BatchService } from './batch.service';
import { TestDriveBatchService } from './test-drive.batch';
import { UploadBatchService } from './upload.batch';
import { ReminderBatchService } from './reminder.batch';
import { CounterBatchService } from './counter.batch';
import {
	BATCH_PENDING_AGENTS,
	BATCH_RECOUNT,
	BATCH_ROLLBACK,
	BATCH_STALE_LISTINGS,
	BATCH_TEST_DRIVE_EXPIRE,
	BATCH_TEST_DRIVE_FOLLOW_UP,
	BATCH_TEST_DRIVE_REMIND,
	BATCH_TIMEZONE,
	BATCH_TOP_AGENTS,
	BATCH_TOP_CARS,
	BATCH_UPLOAD_CLEANUP,
} from './libs/config';

/**
 * Scheduled jobs. Cron format: second minute hour day month weekday.
 * Rankings: every night at 01:00 (Korea time), one after another (rollback :00, cars :20, agents :40),
 * so the rankings are reset before they are recalculated.
 * Test drives: every 10 minutes (expire, remind) and every hour (follow up).
 * Unused uploaded images 03:00, counter check 04:00, admin reminder 09:00, stale listings 10:00 (Korea time).
 * A failing job is logged and never stops the others.
 */
@Controller()
export class BatchController {
	private readonly logger = new Logger('BatchController');
	/** jobs still running: the next tick of the same job is skipped instead of running on top of it */
	private readonly running = new Set<string>();

	constructor(
		private readonly batchService: BatchService,
		private readonly testDriveBatchService: TestDriveBatchService,
		private readonly uploadBatchService: UploadBatchService,
		private readonly reminderBatchService: ReminderBatchService,
		private readonly counterBatchService: CounterBatchService,
	) {}

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

	// :00, :10, :20 ... unanswered requests whose date has passed -> CANCEL
	@Cron('00 */10 * * * *', { name: BATCH_TEST_DRIVE_EXPIRE, timeZone: BATCH_TIMEZONE })
	public async testDriveExpire(): Promise<void> {
		await this.run(BATCH_TEST_DRIVE_EXPIRE, () => this.testDriveBatchService.expireUnanswered());
	}

	// :05, :15, :25 ... confirmed test drives within 24 hours -> reminder to both sides
	@Cron('00 5-59/10 * * * *', { name: BATCH_TEST_DRIVE_REMIND, timeZone: BATCH_TIMEZONE })
	public async testDriveRemind(): Promise<void> {
		await this.run(BATCH_TEST_DRIVE_REMIND, () => this.testDriveBatchService.remindUpcoming());
	}

	// every hour at :30 -> confirmed test drives that are over: ask the dealer to complete or cancel
	@Cron('00 30 * * * *', { name: BATCH_TEST_DRIVE_FOLLOW_UP, timeZone: BATCH_TIMEZONE })
	public async testDriveFollowUp(): Promise<void> {
		await this.run(BATCH_TEST_DRIVE_FOLLOW_UP, () => this.testDriveBatchService.followUpPast());
	}

	// every night at 03:00: uploaded images no car / profile / article uses for a day -> deleted
	@Cron('00 00 03 * * *', { name: BATCH_UPLOAD_CLEANUP, timeZone: BATCH_TIMEZONE })
	public async uploadCleanup(): Promise<void> {
		await this.run(BATCH_UPLOAD_CLEANUP, () => this.uploadBatchService.removeUnused());
	}

	// every night at 04:00: counters (likes, comments, views, followers, cars, articles) checked against the records
	@Cron('00 00 04 * * *', { name: BATCH_RECOUNT, timeZone: BATCH_TIMEZONE })
	public async recount(): Promise<void> {
		await this.run(BATCH_RECOUNT, () => this.counterBatchService.recountAll());
	}

	// every morning at 09:00: admins are told about agent applications waiting more than 48 hours
	@Cron('00 00 09 * * *', { name: BATCH_PENDING_AGENTS, timeZone: BATCH_TIMEZONE })
	public async pendingAgents(): Promise<void> {
		await this.run(BATCH_PENDING_AGENTS, () => this.reminderBatchService.remindPendingAgents());
	}

	// every morning at 10:00: dealers are asked about ACTIVE cars they have not confirmed for 30 days
	@Cron('00 00 10 * * *', { name: BATCH_STALE_LISTINGS, timeZone: BATCH_TIMEZONE })
	public async staleListings(): Promise<void> {
		await this.run(BATCH_STALE_LISTINGS, () => this.reminderBatchService.remindStaleListings());
	}

	@Get()
	public getHello(): string {
		return this.batchService.getHello();
	}

	/** one job: skip it if it is still running, log it, and keep the scheduler alive if it throws */
	private async run(name: string, job: () => Promise<number | void>): Promise<void> {
		if (this.running.has(name)) {
			this.logger.warn(`${name} skipped: the previous run is still working`);
			return;
		}
		this.running.add(name);
		const started = Date.now();
		try {
			const count = await job();
			this.logger.log(
				`${name} done in ${Date.now() - started}ms${typeof count === 'number' ? `, ${count} changed` : ''}`,
			);
		} catch (err: any) {
			this.logger.error(`${name} failed: ${err?.message ?? err}`);
		} finally {
			this.running.delete(name);
		}
	}
}
