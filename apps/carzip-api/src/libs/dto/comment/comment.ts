import { Field, ObjectType } from '@nestjs/graphql';
import { CommentGroup, CommentStatus } from '@app/common/enums/comment.enum';
import { AgentPublic } from '../car/car';
import { TotalCounter } from '../member/member';

@ObjectType()
export class Comment {
	@Field(() => String) _id: string;
	@Field(() => CommentStatus) commentStatus: CommentStatus;
	@Field(() => CommentGroup) commentGroup: CommentGroup;
	@Field(() => String) commentContent: string;
	/** the car, article or member the comment is on (see commentGroup) */
	@Field(() => String) commentRefId: string;
	@Field(() => String) memberId: string;
	@Field(() => Date) createdAt: Date;
	@Field(() => Date) updatedAt: Date;

	/** the commenter (any member type), PUBLIC fields only. agentCompany / contacts are empty for users. */
	@Field(() => AgentPublic, { nullable: true }) memberData?: AgentPublic;
}

/** a page of comments. metaCounter[0].total = how many in total (for page numbers) */
@ObjectType()
export class Comments {
	@Field(() => [Comment]) list: Comment[];
	@Field(() => [TotalCounter], { nullable: true }) metaCounter?: TotalCounter[];
}
