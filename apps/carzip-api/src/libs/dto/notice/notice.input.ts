import { Field, InputType, Int } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsMongoId, IsOptional, Length, Max, Min, ValidateNested } from 'class-validator';
import { availableNoticeSorts } from '../../config';
import { Direction } from '@app/common/enums/common.enum';
import { NoticeCategory, NoticeStatus } from '@app/common/enums/notice.enum';

/** createNotice (ADMIN). The author (memberId) comes from the JWT. */
@InputType()
export class NoticeInput {
	@IsIn(Object.values(NoticeCategory))
	@Field(() => NoticeCategory)
	noticeCategory: NoticeCategory;

	@Length(1, 100)
	@Field(() => String)
	noticeTitle: string;

	@Length(1, 20000) // terms of service can be long
	@Field(() => String)
	noticeContent: string;
}

/** updateNotice (ADMIN): any field; DELETE hides it, ACTIVE restores, HOLD = draft / unpublished */
@InputType()
export class NoticeUpdate {
	@IsMongoId()
	@Field(() => String)
	_id: string;

	@IsOptional()
	@IsIn(Object.values(NoticeCategory))
	@Field(() => NoticeCategory, { nullable: true })
	noticeCategory?: NoticeCategory;

	@IsOptional()
	@IsIn(Object.values(NoticeStatus))
	@Field(() => NoticeStatus, { nullable: true })
	noticeStatus?: NoticeStatus;

	@IsOptional()
	@Length(1, 100)
	@Field(() => String, { nullable: true })
	noticeTitle?: string;

	@IsOptional()
	@Length(1, 20000)
	@Field(() => String, { nullable: true })
	noticeContent?: string;
}

@InputType()
class NoticeSearch {
	@IsOptional()
	@IsIn(Object.values(NoticeCategory))
	@Field(() => NoticeCategory, { nullable: true })
	noticeCategory?: NoticeCategory;

	/** admin list only: the public list is always ACTIVE */
	@IsOptional()
	@IsIn(Object.values(NoticeStatus))
	@Field(() => NoticeStatus, { nullable: true })
	noticeStatus?: NoticeStatus;
}

/** getNotices (public, ACTIVE only) and getAllNoticesByAdmin (any status) */
@InputType()
export class NoticesInquiry {
	@IsInt()
	@Min(1)
	@Field(() => Int)
	page: number;

	@IsInt()
	@Min(1)
	@Max(100)
	@Field(() => Int)
	limit: number;

	@IsOptional()
	@IsIn(availableNoticeSorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@IsIn([Direction.ASC, Direction.DESC])
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsOptional()
	@ValidateNested() // without it nothing inside search is validated
	@Type(() => NoticeSearch)
	@Field(() => NoticeSearch, { nullable: true })
	search?: NoticeSearch;
}
