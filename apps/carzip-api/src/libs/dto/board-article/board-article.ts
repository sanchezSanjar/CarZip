import { Field, Int, ObjectType } from '@nestjs/graphql';
import { BoardArticleCategory, BoardArticleStatus } from '../../enums/board-article.enum';
import { AgentPublic } from '../car/car';
import { TotalCounter } from '../member/member';

@ObjectType()
export class BoardArticle {
	@Field(() => String) _id: string;
	@Field(() => BoardArticleCategory) articleCategory: BoardArticleCategory;
	@Field(() => BoardArticleStatus) articleStatus: BoardArticleStatus;
	@Field(() => String) articleTitle: string;
	@Field(() => String) articleContent: string;
	@Field(() => String, { nullable: true }) articleImage?: string;
	@Field(() => Int) articleViews: number;
	@Field(() => Int) articleLikes: number;
	@Field(() => Int) articleComments: number;
	@Field(() => String) memberId: string;
	@Field(() => Date) createdAt: Date;
	@Field(() => Date) updatedAt: Date;

	/** the author (always an agent: only agents write articles), PUBLIC fields only */
	@Field(() => AgentPublic, { nullable: true }) memberData?: AgentPublic;
}

/** a page of articles. metaCounter[0].total = how many match in total (for page numbers) */
@ObjectType()
export class BoardArticles {
	@Field(() => [BoardArticle]) list: BoardArticle[];
	@Field(() => [TotalCounter], { nullable: true }) metaCounter?: TotalCounter[];
}
