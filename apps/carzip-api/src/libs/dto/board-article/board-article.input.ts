import { Field, InputType, Int } from '@nestjs/graphql';
import { IsIn, IsInt, IsMongoId, IsOptional, IsUrl, Length, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { BoardArticleCategory, BoardArticleStatus } from '@app/common/enums/board-article.enum';
import { Direction } from '@app/common/enums/common.enum';
import { availableBoardArticleSorts } from '../../config';

/**
 * createBoardArticle input: AGENTs and ADMINs write articles (USERs can't).
 * The author (memberId) always comes from the JWT, never from the client.
 */
@InputType()
export class BoardArticleInput {
	@IsIn(Object.values(BoardArticleCategory))
	@Field(() => BoardArticleCategory)
	articleCategory: BoardArticleCategory;

	@Length(3, 100)
	@Field(() => String)
	articleTitle: string;

	@Length(3, 5000)
	@Field(() => String)
	articleContent: string;

	/** URL from POST /upload/image. The service also checks it is one of OUR uploads. */
	@IsOptional()
	@IsUrl({ require_tld: false, require_protocol: true, protocols: ['http', 'https'] })
	@Field(() => String, { nullable: true })
	articleImage?: string;
}

@InputType()
class BAISearch {
	@IsOptional()
	@IsIn(Object.values(BoardArticleCategory))
	@Field(() => BoardArticleCategory, { nullable: true })
	articleCategory?: BoardArticleCategory;

	/** matches the title, case-insensitive */
	@IsOptional()
	@Length(2, 50)
	@Field(() => String, { nullable: true })
	text?: string;

	/** articles of one author */
	@IsOptional()
	@IsMongoId()
	@Field(() => String, { nullable: true })
	memberId?: string;
}

/** getBoardArticles input: the public board, ACTIVE articles only */
@InputType()
export class BoardArticlesInquiry {
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
	@IsIn(availableBoardArticleSorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@IsIn([Direction.ASC, Direction.DESC])
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsOptional()
	@ValidateNested() // without it nothing inside search is validated
	@Type(() => BAISearch)
	@Field(() => BAISearch, { nullable: true })
	search?: BAISearch;
}

@InputType()
class ABAISearch {
	@IsOptional()
	@IsIn(Object.values(BoardArticleStatus))
	@Field(() => BoardArticleStatus, { nullable: true })
	articleStatus?: BoardArticleStatus;

	@IsOptional()
	@IsIn(Object.values(BoardArticleCategory))
	@Field(() => BoardArticleCategory, { nullable: true })
	articleCategory?: BoardArticleCategory;
}

/** getAllBoardArticlesByAdmin input: every article, any status */
@InputType()
export class AllBoardArticlesInquiry {
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
	@IsIn(availableBoardArticleSorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@IsIn([Direction.ASC, Direction.DESC])
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsOptional()
	@ValidateNested() // without it nothing inside search is validated
	@Type(() => ABAISearch)
	@Field(() => ABAISearch, { nullable: true })
	search?: ABAISearch;
}
