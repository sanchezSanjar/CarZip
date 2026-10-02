import { Injectable, Logger } from '@nestjs/common';

/** the work behind each scheduled job (filled in by the job scheduler commit) */
@Injectable()
export class BatchService {
	private readonly logger = new Logger('BatchService');

	/** reset the rankings before they are recalculated */
	public async batchRollback(): Promise<void> {
		this.logger.log('batchRollback');
	}

	/** rank the cars (carRank) */
	public async batchTopCars(): Promise<void> {
		this.logger.log('batchTopCars');
	}

	/** rank the agents (memberRank) */
	public async batchTopAgents(): Promise<void> {
		this.logger.log('batchTopAgents');
	}

	public getHello(): string {
		return 'Welcome to CarZip BATCH Server!';
	}
}
