import { Field, InputType, Int } from '@nestjs/graphql';
import { IsIn, IsInt, IsMongoId, IsOptional, Length, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CommentGroup } from '@app/common/enums/comment.enum';
import { Direction } from '@app/common/enums/common.enum';
import { availableCommentSorts } from '../../config';

/** createComment input. The commenter (memberId) always comes from the JWT, never from the client. */
@InputType()
export class CommentInput {
	@IsIn(Object.values(CommentGroup))
	@Field(() => CommentGroup)
	commentGroup: CommentGroup;

	@Length(1, 500)
	@Field(() => String)
	commentContent: string;

	/** the car, article or member to comment on, matching commentGroup */
	@IsMongoId()
	@Field(() => String)
	commentRefId: string;
}

@InputType()
class CISearch {
	/** comments of this car / article / member */
	@IsMongoId()
	@Field(() => String)
	commentRefId: string;
}

/** getComments input: ACTIVE comments of one item, page-based */
@InputType()
export class CommentsInquiry {
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
	@IsIn(availableCommentSorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@IsIn([Direction.ASC, Direction.DESC])
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@ValidateNested() // without it nothing inside search is validated
	@Type(() => CISearch)
	@Field(() => CISearch)
	search: CISearch;
}
