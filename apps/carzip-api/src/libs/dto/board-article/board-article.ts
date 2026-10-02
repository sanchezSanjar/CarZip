import { Field, Int, ObjectType } from '@nestjs/graphql';
import { BoardArticleCategory, BoardArticleStatus } from '@app/common/enums/board-article.enum';
import { AgentPublic } from '../car/car';
import { TotalCounter } from '../member/member';
import { MeLiked } from '../like/like';

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

	/** the author (an agent or an admin), PUBLIC fields only. agentCompany is empty for admins. */
	@Field(() => AgentPublic, { nullable: true }) memberData?: AgentPublic;
	/** "did I like this?" for the logged-in viewer: one entry with myFavorite = true, or empty. null for guests. */
	@Field(() => [MeLiked], { nullable: true }) meLiked?: MeLiked[];
}

/** a page of articles. metaCounter[0].total = how many match in total (for page numbers) */
@ObjectType()
export class BoardArticles {
	@Field(() => [BoardArticle]) list: BoardArticle[];
	@Field(() => [TotalCounter], { nullable: true }) metaCounter?: TotalCounter[];
}
