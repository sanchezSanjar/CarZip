import { Field, ObjectType } from '@nestjs/graphql';
import { CommentGroup, CommentStatus } from '@app/common/enums/comment.enum';
import { AgentPublic } from '../car/car';
import { TotalCounter } from '../member/member';

/** what a comment is on, for the writer's own list: the car / article title or the dealer's name */
@ObjectType()
export class CommentTargetData {
	@Field(() => String) title: string;
	@Field(() => String, { nullable: true }) image?: string;
}

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

	/** only in getMyComments: the car / article / dealer the comment is on (null if it is gone) */
	@Field(() => CommentTargetData, { nullable: true }) targetData?: CommentTargetData;
}

/** a page of comments. metaCounter[0].total = how many in total (for page numbers) */
@ObjectType()
export class Comments {
	@Field(() => [Comment]) list: Comment[];
	@Field(() => [TotalCounter], { nullable: true }) metaCounter?: TotalCounter[];
}
