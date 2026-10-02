import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Block, Blocks } from '../../libs/dto/block/block';
import { OrdinaryInquiry } from '../../libs/dto/car/car.input';
import { Message } from '@app/common/enums/common.enum';
import { MemberStatus, MemberType } from '@app/common/enums/member.enum';
import { lookupPublicMember } from '../../libs/utils/lookup';

type BlockDoc = { _id: Types.ObjectId; blockerId: Types.ObjectId; blockedId: Types.ObjectId; createdAt: Date };
type MemberDoc = { _id: Types.ObjectId; memberType: MemberType; memberStatus: MemberStatus; memberBlocks?: number };

/**
 * Personal Block flowchart (AGENT only). It protects the agent only: the blocked member can no longer comment,
 * like, follow or request test drives on THIS agent's cars and profile (checked in those services), but still
 * browses and uses the rest of CarZip. Existing comments stay (only ADMIN deletes). Never site-wide: global
 * blocking is ADMIN only (memberStatus BLOCK). Nobody is notified: a block is the agent's private decision.
 * memberBlocks on the blocked member = how many agents blocked them (private: only they and admins see it).
 */
@Injectable()
export class BlockService {
	constructor(
		@InjectModel('Block') private readonly blockModel: Model<BlockDoc>,
		@InjectModel('Member') private readonly memberModel: Model<MemberDoc>,
	) {}

	public async blockMember(agentId: Types.ObjectId, targetId: Types.ObjectId): Promise<Block> {
		if (agentId.equals(targetId)) throw new BadRequestException(Message.BLOCK_SELF_DENIED);
		const target = await this.memberModel.findById(targetId).select('memberType memberStatus').lean<MemberDoc>().exec();
		if (!target || target.memberStatus === MemberStatus.DELETE) throw new NotFoundException(Message.NO_DATA_FOUND);
		if (target.memberType === MemberType.ADMIN) throw new ForbiddenException(Message.BLOCK_ADMIN_DENIED);

		let created: BlockDoc;
		try {
			created = (await this.blockModel.create({ blockerId: agentId, blockedId: targetId })).toObject();
		} catch (err: any) {
			// "already blocked?" is answered by the unique index: two taps at once can't both insert or both count
			if (err?.code === 11000) throw new BadRequestException(Message.ALREADY_BLOCKED);
			throw err;
		}
		await this.memberModel.updateOne({ _id: targetId }, { $inc: { memberBlocks: 1 } }).exec();
		return this.withProfile(created);
	}

	public async unblockMember(agentId: Types.ObjectId, targetId: Types.ObjectId): Promise<Block> {
		// one atomic delete: two parallel unblocks can't both lower the counter
		const removed = await this.blockModel
			.findOneAndDelete({ blockerId: agentId, blockedId: targetId })
			.lean<BlockDoc>()
			.exec();
		if (!removed) throw new BadRequestException(Message.NOT_BLOCKED);
		await this.memberModel.updateOne({ _id: targetId }, { $inc: { memberBlocks: -1 } }).exec();
		return this.withProfile(removed);
	}

	/** the agent's own blocked members, newest block first */
	public async getMyBlocks(agentId: Types.ObjectId, input: OrdinaryInquiry): Promise<Blocks> {
		const [result] = await this.blockModel
			.aggregate<Blocks>([
				{ $match: { blockerId: agentId } },
				{ $sort: { createdAt: -1, _id: -1 } },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							...lookupPublicMember('blockedData', 'blockedId'),
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();
		return result ?? { list: [], metaCounter: [] };
	}

	/** "did I (an agent) block this member?" for the Block / Unblock button on a profile */
	public async isBlocked(agentId: Types.ObjectId, targetId: Types.ObjectId): Promise<boolean> {
		return !!(await this.blockModel.exists({ blockerId: agentId, blockedId: targetId }).exec());
	}

	private async withProfile(block: BlockDoc): Promise<Block> {
		const [result] = await this.blockModel
			.aggregate<Block>([{ $match: { _id: block._id } }, ...lookupPublicMember('blockedData', 'blockedId')])
			.exec();
		// after an unblock the document is gone: answer with what was removed
		return result ?? (block as unknown as Block);
	}
}
