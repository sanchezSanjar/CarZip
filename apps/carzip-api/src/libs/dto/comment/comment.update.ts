import { Field, InputType } from '@nestjs/graphql';
import { IsMongoId, Length } from 'class-validator';

/**
 * updateComment input: the author edits the TEXT of their own comment.
 * No status here: per the flowchart "existing comments stay (only ADMIN deletes)", so deleting
 * is admin moderation (removeCommentsByAdmin), not something a commenter or agent can do.
 */
@InputType()
export class CommentUpdate {
	@IsMongoId()
	@Field(() => String)
	_id: string;

	@Length(1, 500)
	@Field(() => String)
	commentContent: string;
}
