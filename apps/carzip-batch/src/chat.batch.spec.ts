import { describe, it, expect, vi } from 'vitest';
import { ChatBatchService } from './chat.batch';
import { CHAT_KEEP_DAYS } from '@app/common/config/chat';

const DAY = 24 * 60 * 60 * 1000;

/** fake chatMessages model: `oldestKept` is the 15th newest message (or none when there are fewer than 15) */
function setup(oldestKept: Date | null) {
	const chatMessageModel = {
		find: vi.fn(() => ({
			sort: () => ({
				skip: () => ({
					limit: () => ({
						select: () => ({
							lean: () => ({ exec: vi.fn().mockResolvedValue(oldestKept ? [{ createdAt: oldestKept }] : []) }),
						}),
					}),
				}),
			}),
		})),
		deleteMany: vi.fn(() => ({ exec: vi.fn().mockResolvedValue({ deletedCount: 7 }) })),
	};
	return { service: new ChatBatchService(chatMessageModel as never), chatMessageModel };
}

describe('ChatBatchService.removeOld', () => {
	it('deletes nothing while there are fewer than 15 messages', async () => {
		const { service, chatMessageModel } = setup(null);
		expect(await service.removeOld()).toBe(0);
		expect(chatMessageModel.deleteMany).not.toHaveBeenCalled();
	});

	it(`deletes messages older than ${CHAT_KEEP_DAYS} days when the newest 15 are recent`, async () => {
		const { service, chatMessageModel } = setup(new Date(Date.now() - DAY));
		expect(await service.removeOld()).toBe(7);
		const { createdAt } = (chatMessageModel.deleteMany.mock.calls[0] as unknown as [{ createdAt: { $lt: Date } }])[0];
		const cutoffDaysAgo = (Date.now() - createdAt.$lt.getTime()) / DAY;
		expect(Math.round(cutoffDaysAgo)).toBe(CHAT_KEEP_DAYS);
	});

	it('in a quiet chat, still keeps the newest 15 even if they are older than that', async () => {
		const veryOld = new Date(Date.now() - 90 * DAY);
		const { service, chatMessageModel } = setup(veryOld);
		await service.removeOld();
		expect(chatMessageModel.deleteMany).toHaveBeenCalledWith({ createdAt: { $lt: veryOld } });
	});
});
