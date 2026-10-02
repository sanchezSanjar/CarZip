import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notice, Notices } from '../../libs/dto/notice/notice';
import { NoticeInput, NoticesInquiry, NoticeUpdate } from '../../libs/dto/notice/notice.input';
import { Direction, Message } from '@app/common/enums/common.enum';
import { NoticeStatus } from '@app/common/enums/notice.enum';
import { shapeIntoMongoObjectId } from '../../libs/config';

/**
 * Admin flowchart "Notices / FAQ / Terms": admins write, everyone (guests too) reads the ACTIVE ones.
 * Status: ACTIVE = published, HOLD = draft (not public yet), DELETE = hidden, then removable for good.
 */
@Injectable()
export class NoticeService {
	constructor(@InjectModel('Notice') private readonly noticeModel: Model<Notice>) {}

	public async createNotice(adminId: Types.ObjectId, input: NoticeInput): Promise<Notice> {
		const created = await this.noticeModel.create({
			...input,
			noticeTitle: input.noticeTitle.trim(),
			memberId: adminId,
		});
		return created.toObject();
	}

	public async updateNotice(input: NoticeUpdate): Promise<Notice> {
		const { _id, ...changes } = input;
		const $set = Object.fromEntries(
			Object.entries(changes).filter(([, value]) => value !== undefined && value !== null),
		);
		if (!Object.keys($set).length) throw new BadRequestException(Message.NOTHING_TO_UPDATE);
		const updated = await this.noticeModel
			.findByIdAndUpdate(shapeIntoMongoObjectId(_id), { $set }, { new: true })
			.lean<Notice>()
			.exec();
		if (!updated) throw new NotFoundException(Message.NO_DATA_FOUND);
		return updated;
	}

	/** remove FOR GOOD: only a notice already set to DELETE, so nothing disappears by one wrong click */
	public async removeNoticeByAdmin(noticeId: Types.ObjectId): Promise<Notice> {
		const removed = await this.noticeModel
			.findOneAndDelete({ _id: noticeId, noticeStatus: NoticeStatus.DELETE })
			.lean<Notice>()
			.exec();
		if (removed) return removed;
		if (await this.noticeModel.exists({ _id: noticeId }).exec()) {
			throw new BadRequestException(Message.NOTICE_REMOVE_ONLY_DELETED);
		}
		throw new NotFoundException(Message.NO_DATA_FOUND);
	}

	/** one notice: the public sees ACTIVE ones only, admins any */
	public async getNotice(noticeId: Types.ObjectId, isAdmin: boolean): Promise<Notice> {
		const filter = isAdmin ? { _id: noticeId } : { _id: noticeId, noticeStatus: NoticeStatus.ACTIVE };
		const notice = await this.noticeModel.findOne(filter).lean<Notice>().exec();
		if (!notice) throw new NotFoundException(Message.NO_DATA_FOUND);
		return notice;
	}

	/** public list: ACTIVE only, whatever the client sends as status */
	public async getNotices(input: NoticesInquiry): Promise<Notices> {
		return this.page({ ...input, search: { ...input.search, noticeStatus: NoticeStatus.ACTIVE } });
	}

	/** admin list: drafts and deleted ones too, optionally filtered by status */
	public async getAllNoticesByAdmin(input: NoticesInquiry): Promise<Notices> {
		return this.page(input);
	}

	private async page(input: NoticesInquiry): Promise<Notices> {
		const match: Record<string, unknown> = {};
		if (input.search?.noticeCategory) match.noticeCategory = input.search.noticeCategory;
		if (input.search?.noticeStatus) match.noticeStatus = input.search.noticeStatus;
		const sortField = input.sort ?? 'createdAt';
		const direction = input.direction ?? Direction.DESC;
		const [result] = await this.noticeModel
			.aggregate<Notices>([
				{ $match: match },
				{ $sort: { [sortField]: direction, _id: direction } },
				{
					$facet: {
						list: [{ $skip: (input.page - 1) * input.limit }, { $limit: input.limit }],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();
		return result ?? { list: [], metaCounter: [] };
	}
}
