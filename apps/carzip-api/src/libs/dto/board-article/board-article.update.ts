import { Field, InputType } from '@nestjs/graphql';
import { IsIn, IsMongoId, IsOptional, IsUrl, Length } from 'class-validator';
import { BoardArticleStatus } from '@app/common/enums/board-article.enum';

/**
 * updateBoardArticle input: edit an article, or delete it (articleStatus: DELETE).
 * - AGENT: only their OWN articles
 * - ADMIN: ANY article (their own and agents')
 * A deleted article can't be brought back here; restoring is admin moderation.
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

/**
 * updateBoardArticleByAdmin input: status moderation. Editing title / content of any article is
 * updateBoardArticle (admins may edit any article there); this one can also RESTORE a deleted article.
 */
@InputType()
export class BoardArticleUpdateByAdmin {
	@IsMongoId()
	@Field(() => String)
	_id: string;

	@IsIn([BoardArticleStatus.ACTIVE, BoardArticleStatus.DELETE])
	@Field(() => BoardArticleStatus)
	articleStatus: BoardArticleStatus;
}
