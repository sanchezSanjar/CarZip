import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CarStatus } from '@app/common/enums/car.enum';
import { MemberStatus, MemberType } from '@app/common/enums/member.enum';

/** the batch only updates ranks: the GraphQL types of the API are not needed here */
type CarDoc = { carStatus: CarStatus; carRank: number };
type MemberDoc = { memberType: MemberType; memberStatus: MemberStatus; memberRank: number };

/** a counter in a pipeline update. A missing field counts as 0 (otherwise $add gives null) */
const counter = (field: string) => ({ $ifNull: [`$${field}`, 0] });

/**
 * Rankings. Each job is ONE updateMany, so the database does the work:
 * no loading every document into memory and no thousands of parallel findByIdAndUpdate calls.
 * The rank is computed from the counters the API already keeps up to date.
 */
@Injectable()
export class BatchService {
	constructor(
		@InjectModel('Car') private readonly carModel: Model<CarDoc>,
		@InjectModel('Member') private readonly memberModel: Model<MemberDoc>,
	) {}

	/** reset every rank, including cars/agents that are no longer ACTIVE (otherwise their old rank stays forever) */
	public async batchRollback(): Promise<void> {
		await this.carModel.updateMany({ carRank: { $ne: 0 } }, { $set: { carRank: 0 } }).exec();
		await this.memberModel.updateMany({ memberRank: { $ne: 0 } }, { $set: { memberRank: 0 } }).exec();
	}

	/** carRank = likes * 2 + views (only cars on sale) */
	public async batchTopCars(): Promise<void> {
		await this.carModel
			.updateMany({ carStatus: CarStatus.ACTIVE }, [
				{ $set: { carRank: { $add: [{ $multiply: [counter('carLikes'), 2] }, counter('carViews')] } } },
			])
			.exec();
	}

	/** memberRank = cars * 5 + articles * 3 + likes * 2 + views (only active dealers) */
	public async batchTopAgents(): Promise<void> {
		await this.memberModel
			.updateMany({ memberType: MemberType.AGENT, memberStatus: MemberStatus.ACTIVE }, [
				{
					$set: {
						memberRank: {
							$add: [
								{ $multiply: [counter('memberCars'), 5] },
								{ $multiply: [counter('memberArticles'), 3] },
								{ $multiply: [counter('memberLikes'), 2] },
								counter('memberViews'),
							],
						},
					},
				},
			])
			.exec();
	}

	public getHello(): string {
		return 'Welcome to CarZip BATCH Server!';
	}
}
