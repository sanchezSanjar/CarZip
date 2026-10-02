import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { AnyBulkWriteOperation, Model, PipelineStage, Types } from 'mongoose';
import { BoardArticleStatus } from '@app/common/enums/board-article.enum';
import { CarStatus } from '@app/common/enums/car.enum';
import { CommentGroup, CommentStatus } from '@app/common/enums/comment.enum';
import { LikeGroup } from '@app/common/enums/like.enum';
import { ViewGroup } from '@app/common/enums/view.enum';

type Doc = { _id: Types.ObjectId } & Record<string, unknown>;

/** one stored counter and where its true value comes from */
interface CounterRule {
	target: Model<Doc>;
	field: string;
	source: Model<Doc>;
	/** source documents that count, grouped by the id of the target they belong to */
	match: Record<string, unknown>;
	groupBy: string;
}

/**
 * Nightly check of every stored counter (carLikes, memberFollowers, ...). The API keeps them right with $inc,
 * but a crash between two writes, a manual DB edit or a bug can make one drift. Here the true value is counted
 * from the records and ONLY counters that differ are fixed. Each fix is conditional on the value we read:
 * if a like lands in between, that counter is left for the next night instead of being overwritten.
 */
@Injectable()
export class CounterBatchService {
	private readonly logger = new Logger('CounterBatchService');

	constructor(
		@InjectModel('Car') private readonly carModel: Model<Doc>,
		@InjectModel('Member') private readonly memberModel: Model<Doc>,
		@InjectModel('BoardArticle') private readonly boardArticleModel: Model<Doc>,
		@InjectModel('Like') private readonly likeModel: Model<Doc>,
		@InjectModel('Comment') private readonly commentModel: Model<Doc>,
		@InjectModel('View') private readonly viewModel: Model<Doc>,
		@InjectModel('Follow') private readonly followModel: Model<Doc>,
		@InjectModel('Block') private readonly blockModel: Model<Doc>,
	) {}

	/** returns how many counters were wrong and fixed */
	public async recountAll(): Promise<number> {
		const active = { commentStatus: CommentStatus.ACTIVE }; // an admin-deleted comment lowered the counter
		const rules: CounterRule[] = [
			// cars
			{
				target: this.carModel,
				field: 'carLikes',
				source: this.likeModel,
				match: { likeGroup: LikeGroup.CAR },
				groupBy: 'likeRefId',
			},
			{
				target: this.carModel,
				field: 'carComments',
				source: this.commentModel,
				match: { commentGroup: CommentGroup.CAR, ...active },
				groupBy: 'commentRefId',
			},
			{
				target: this.carModel,
				field: 'carViews',
				source: this.viewModel,
				match: { viewGroup: ViewGroup.CAR },
				groupBy: 'viewRefId',
			},
			// articles
			{
				target: this.boardArticleModel,
				field: 'articleLikes',
				source: this.likeModel,
				match: { likeGroup: LikeGroup.ARTICLE },
				groupBy: 'likeRefId',
			},
			{
				target: this.boardArticleModel,
				field: 'articleComments',
				source: this.commentModel,
				match: { commentGroup: CommentGroup.ARTICLE, ...active },
				groupBy: 'commentRefId',
			},
			{
				target: this.boardArticleModel,
				field: 'articleViews',
				source: this.viewModel,
				match: { viewGroup: ViewGroup.ARTICLE },
				groupBy: 'viewRefId',
			},
			// members
			{
				target: this.memberModel,
				field: 'memberLikes',
				source: this.likeModel,
				match: { likeGroup: LikeGroup.MEMBER },
				groupBy: 'likeRefId',
			},
			{
				target: this.memberModel,
				field: 'memberComments',
				source: this.commentModel,
				match: { commentGroup: CommentGroup.MEMBER, ...active },
				groupBy: 'commentRefId',
			},
			{
				target: this.memberModel,
				field: 'memberViews',
				source: this.viewModel,
				match: { viewGroup: ViewGroup.MEMBER },
				groupBy: 'viewRefId',
			},
			{
				target: this.memberModel,
				field: 'memberFollowers',
				source: this.followModel,
				match: {},
				groupBy: 'followingId',
			},
			{
				target: this.memberModel,
				field: 'memberFollowings',
				source: this.followModel,
				match: {},
				groupBy: 'followerId',
			},
			// how many agents blocked the member
			{ target: this.memberModel, field: 'memberBlocks', source: this.blockModel, match: {}, groupBy: 'blockedId' },
			// every car that is not DELETE (SOLD stays: sales history), every ACTIVE article
			{
				target: this.memberModel,
				field: 'memberCars',
				source: this.carModel,
				match: { carStatus: { $ne: CarStatus.DELETE } },
				groupBy: 'memberId',
			},
			{
				target: this.memberModel,
				field: 'memberArticles',
				source: this.boardArticleModel,
				match: { articleStatus: BoardArticleStatus.ACTIVE },
				groupBy: 'memberId',
			},
		];

		let fixed = 0;
		for (const rule of rules) {
			const n = await this.recount(rule);
			if (n) this.logger.warn(`${rule.field}: fixed ${n} drifted counter(s)`);
			fixed += n;
		}
		return fixed;
	}

	private async recount({ target, field, source, match, groupBy }: CounterRule): Promise<number> {
		const pipeline: PipelineStage[] = [{ $match: match }, { $group: { _id: `$${groupBy}`, n: { $sum: 1 } } }];
		const truth = new Map<string, number>();
		for (const row of await source.aggregate<{ _id: Types.ObjectId; n: number }>(pipeline).exec()) {
			truth.set(String(row._id), row.n);
		}

		const ops: AnyBulkWriteOperation<Doc>[] = [];
		let fixed = 0;
		const flush = async () => {
			if (!ops.length) return;
			const result = await target.bulkWrite(ops.splice(0), { ordered: false, timestamps: false });
			fixed += result.modifiedCount;
		};
		// stream the targets: no need to hold every member / car in memory
		for await (const doc of target.find().select(field).lean<Doc>().cursor()) {
			const stored = doc[field] as number | undefined;
			const correct = truth.get(String(doc._id)) ?? 0;
			if (stored === correct) continue;
			ops.push({
				updateOne: {
					// only if it still holds the value we read: a like in between is not overwritten
					filter: { _id: doc._id, [field]: stored === undefined ? { $exists: false } : stored },
					update: { $set: { [field]: correct } },
					timestamps: false,
				},
			});
			if (ops.length >= 500) await flush();
		}
		await flush();
		return fixed;
	}
}
