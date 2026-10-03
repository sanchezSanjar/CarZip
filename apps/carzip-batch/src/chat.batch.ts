import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CHAT_HISTORY, CHAT_KEEP_DAYS } from '@app/common/config/chat';

/**
 * Live chat cleanup: messages older than CHAT_KEEP_DAYS are deleted, but the newest CHAT_HISTORY always stay,
 * so a quiet chat never looks empty to the next visitor.
 */
@Injectable()
export class ChatBatchService {
	private readonly logger = new Logger('ChatBatchService');

	constructor(@InjectModel('ChatMessage') private readonly chatMessageModel: Model<{ createdAt: Date }>) {}

	/** returns how many messages were deleted */
	public async removeOld(): Promise<number> {
		const cutoff = new Date(Date.now() - CHAT_KEEP_DAYS * 24 * 60 * 60 * 1000);
		// the oldest of the messages that must stay
		const kept = await this.chatMessageModel
			.find()
			.sort({ createdAt: -1 })
			.skip(CHAT_HISTORY - 1)
			.limit(1)
			.select('createdAt')
			.lean<{ createdAt: Date }[]>()
			.exec();
		if (!kept.length) return 0; // fewer than CHAT_HISTORY messages in total: nothing to delete
		const before = kept[0].createdAt < cutoff ? kept[0].createdAt : cutoff;
		const { deletedCount } = await this.chatMessageModel.deleteMany({ createdAt: { $lt: before } }).exec();
		if (deletedCount) this.logger.log(`old chat messages deleted: ${deletedCount}`);
		return deletedCount;
	}
}
