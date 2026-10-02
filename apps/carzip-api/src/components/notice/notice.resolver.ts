import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Types } from 'mongoose';
import { NoticeService } from './notice.service';
import { Notice, Notices } from '../../libs/dto/notice/notice';
import { NoticeInput, NoticesInquiry, NoticeUpdate } from '../../libs/dto/notice/notice.input';
import { MemberType } from '@app/common/enums/member.enum';
import { AuthMemberData } from '../../libs/types/auth';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { WithoutGuard } from '../auth/guards/without.guard';
import { AuthMember } from '../auth/decorators/authMember.decorator';

@Resolver()
export class NoticeResolver {
	constructor(private readonly noticeService: NoticeService) {}

	// public: guests and members read published notices, FAQ and terms
	@UseGuards(WithoutGuard)
	@Query(() => Notices)
	public async getNotices(@Args('input') input: NoticesInquiry): Promise<Notices> {
		return this.noticeService.getNotices(input);
	}

	@UseGuards(WithoutGuard)
	@Query(() => Notice)
	public async getNotice(
		@Args('noticeId') noticeId: string,
		@AuthMember() authMember: AuthMemberData | null,
	): Promise<Notice> {
		return this.noticeService.getNotice(shapeIntoMongoObjectId(noticeId), authMember?.memberType === MemberType.ADMIN);
	}

	/** ADMIN */

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Notice)
	public async createNotice(
		@Args('input') input: NoticeInput,
		@AuthMember('_id') adminId: Types.ObjectId,
	): Promise<Notice> {
		return this.noticeService.createNotice(adminId, input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Notice)
	public async updateNotice(@Args('input') input: NoticeUpdate): Promise<Notice> {
		return this.noticeService.updateNotice(input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Notice)
	public async removeNoticeByAdmin(@Args('noticeId') noticeId: string): Promise<Notice> {
		return this.noticeService.removeNoticeByAdmin(shapeIntoMongoObjectId(noticeId));
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => Notices)
	public async getAllNoticesByAdmin(@Args('input') input: NoticesInquiry): Promise<Notices> {
		return this.noticeService.getAllNoticesByAdmin(input);
	}
}
