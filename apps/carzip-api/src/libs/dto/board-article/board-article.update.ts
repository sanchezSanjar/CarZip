import { Field, InputType } from '@nestjs/graphql';
import { IsIn, IsMongoId, IsOptional, IsUrl, Length } from 'class-validator';
import { BoardArticleStatus } from '../../enums/board-article.enum';

/**
 * updateBoardArticle input: the author edits their OWN article, or deletes it (articleStatus: DELETE).
 * A deleted article can't be brought back by its author; admin moderation has its own input.
 */
@InputType()
export class BoardArticleUpdate {
	@IsMongoId()
	@Field(() => String)
	_id: string;

	@IsOptional()
	@IsIn([BoardArticleStatus.DELETE])
	@Field(() => BoardArticleStatus, { nullable: true })
	articleStatus?: BoardArticleStatus;

	@IsOptional()
	@Length(3, 100)
	@Field(() => String, { nullable: true })
	articleTitle?: string;

	@IsOptional()
	@Length(3, 5000)
	@Field(() => String, { nullable: true })
	articleContent?: string;

	@IsOptional()
	@IsUrl({ require_tld: false, require_protocol: true, protocols: ['http', 'https'] })
	@Field(() => String, { nullable: true })
	articleImage?: string;
}
