import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Types } from 'mongoose';
import { BoardArticleService } from './board-article.service';
import { BoardArticle, BoardArticles } from '../../libs/dto/board-article/board-article';
import {
	AllBoardArticlesInquiry,
	BoardArticleInput,
	BoardArticlesInquiry,
} from '../../libs/dto/board-article/board-article.input';
import { BoardArticleUpdate, BoardArticleUpdateByAdmin } from '../../libs/dto/board-article/board-article.update';
import { MemberType } from '../../libs/enums/member.enum';
import { AuthMemberData } from '../../libs/types/auth';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { WithoutGuard } from '../auth/guards/without.guard';
import { AuthGuard } from '../auth/guards/auth.guard';
import { AuthMember } from '../auth/decorators/authMember.decorator';

@Resolver()
export class BoardArticleResolver {
	constructor(private readonly boardArticleService: BoardArticleService) {}

	// agents and admins write, users only read
	@Roles(MemberType.AGENT, MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => BoardArticle)
	public async createBoardArticle(
		@Args('input') input: BoardArticleInput,
		@AuthMember('_id') memberId: Types.ObjectId, // the author always comes from the JWT
	): Promise<BoardArticle> {
		return this.boardArticleService.createBoardArticle(memberId, input);
	}

	// public: guests read it, logged-in viewers also count a view
	@UseGuards(WithoutGuard)
	@Query(() => BoardArticle)
	public async getBoardArticle(
		@Args('articleId') articleId: string,
		@AuthMember() authMember: AuthMemberData | null,
	): Promise<BoardArticle> {
		return this.boardArticleService.getBoardArticle(shapeIntoMongoObjectId(articleId), authMember);
	}

	// agent: own articles, admin: any article
	@Roles(MemberType.AGENT, MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => BoardArticle)
	public async updateBoardArticle(
		@Args('input') input: BoardArticleUpdate,
		@AuthMember() authMember: AuthMemberData,
	): Promise<BoardArticle> {
		return this.boardArticleService.updateBoardArticle(authMember, input);
	}

	// like / un-like an article (toggle): any logged-in member, except the author
	@UseGuards(AuthGuard)
	@Mutation(() => BoardArticle)
	public async likeTargetBoardArticle(
		@Args('articleId') articleId: string,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<BoardArticle> {
		return this.boardArticleService.likeTargetBoardArticle(memberId, shapeIntoMongoObjectId(articleId));
	}

	// public board (like / "did I like it" comes with the like commits)
	@Query(() => BoardArticles)
	public async getBoardArticles(@Args('input') input: BoardArticlesInquiry): Promise<BoardArticles> {
		return this.boardArticleService.getBoardArticles(input);
	}

	/** ADMIN */

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => BoardArticles)
	public async getAllBoardArticlesByAdmin(@Args('input') input: AllBoardArticlesInquiry): Promise<BoardArticles> {
		return this.boardArticleService.getAllBoardArticlesByAdmin(input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => BoardArticle)
	public async updateBoardArticleByAdmin(@Args('input') input: BoardArticleUpdateByAdmin): Promise<BoardArticle> {
		return this.boardArticleService.updateBoardArticleByAdmin(input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => BoardArticle)
	public async removeBoardArticleByAdmin(@Args('articleId') articleId: string): Promise<BoardArticle> {
		return this.boardArticleService.removeBoardArticleByAdmin(shapeIntoMongoObjectId(articleId));
	}
}
