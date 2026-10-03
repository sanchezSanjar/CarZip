import { describe, it, expect, vi } from 'vitest';
import { Types } from 'mongoose';
import { BlockService } from './block.service';
import { MemberStatus, MemberType } from '@app/common/enums/member.enum';

const resolved = <T>(value: T) => ({ exec: vi.fn().mockResolvedValue(value) });

/** BlockService with fake models: the agent blocks a buyer who may or may not follow them */
function setup(follows: boolean) {
	const agentId = new Types.ObjectId();
	const buyerId = new Types.ObjectId();
	const block = { _id: new Types.ObjectId(), blockerId: agentId, blockedId: buyerId, createdAt: new Date() };
	const blockModel = {
		create: vi.fn().mockResolvedValue({ toObject: () => block }),
		aggregate: vi.fn(() => resolved([block])),
	};
	const memberModel = {
		findById: vi.fn(() => ({
			select: () => ({ lean: () => resolved({ memberType: MemberType.USER, memberStatus: MemberStatus.ACTIVE }) }),
		})),
		updateOne: vi.fn(() => resolved({ modifiedCount: 1 })),
	};
	const followModel = {
		findOneAndDelete: vi.fn(() => ({ lean: () => resolved(follows ? { _id: new Types.ObjectId() } : null) })),
	};
	const service = new BlockService(blockModel as never, memberModel as never, followModel as never);
	return { service, memberModel, followModel, agentId, buyerId };
}

describe('BlockService.blockMember', () => {
	it("ends the blocked member's follow and lowers both counters", async () => {
		const { service, memberModel, followModel, agentId, buyerId } = setup(true);
		await service.blockMember(agentId, buyerId);

		expect(followModel.findOneAndDelete).toHaveBeenCalledWith({ followerId: buyerId, followingId: agentId });
		expect(memberModel.updateOne).toHaveBeenCalledWith({ _id: buyerId }, { $inc: { memberBlocks: 1 } });
		expect(memberModel.updateOne).toHaveBeenCalledWith({ _id: buyerId }, { $inc: { memberFollowings: -1 } });
		expect(memberModel.updateOne).toHaveBeenCalledWith({ _id: agentId }, { $inc: { memberFollowers: -1 } });
	});

	it("doesn't touch follower counts when the member wasn't following", async () => {
		const { service, memberModel, agentId, buyerId } = setup(false);
		await service.blockMember(agentId, buyerId);
		expect(memberModel.updateOne).toHaveBeenCalledTimes(1); // only memberBlocks +1
	});

	it('refuses to block yourself', async () => {
		const { service, agentId } = setup(false);
		await expect(service.blockMember(agentId, agentId)).rejects.toThrow();
	});
});
