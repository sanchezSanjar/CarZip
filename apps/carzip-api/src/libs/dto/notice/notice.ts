import { Field, ObjectType } from '@nestjs/graphql';
import { TotalCounter } from '../member/member';
import { NoticeCategory, NoticeStatus } from '@app/common/enums/notice.enum';

@ObjectType()
export class Notice {
	@Field(() => String) _id: string;
	@Field(() => NoticeCategory) noticeCategory: NoticeCategory;
	@Field(() => NoticeStatus) noticeStatus: NoticeStatus;
	@Field(() => String) noticeTitle: string;
	/** plain text: the frontend must render it as text, never as HTML */
	@Field(() => String) noticeContent: string;
	@Field(() => String) memberId: string; // the admin who wrote it
	@Field(() => Date) createdAt: Date;
	@Field(() => Date) updatedAt: Date;
}

/** a page of notices. metaCounter[0].total = how many match in total */
@ObjectType()
export class Notices {
	@Field(() => [Notice]) list: Notice[];
	@Field(() => [TotalCounter], { nullable: true }) metaCounter?: TotalCounter[];
}
