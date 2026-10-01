import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Types } from 'mongoose';
import { CommentService } from './comment.service';
import { Comment, Comments } from '../../libs/dto/comment/comment';
import { CommentInput, CommentsInquiry } from '../../libs/dto/comment/comment.input';
import { CommentUpdate } from '../../libs/dto/comment/comment.update';
import { AuthGuard } from '../auth/guards/auth.guard';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MemberType } from '../../libs/enums/member.enum';
import { shapeIntoMongoObjectId } from '../../libs/config';

@Resolver()
export class CommentResolver {
	constructor(private readonly commentService: CommentService) {}

	// any logged-in member comments anywhere (unless the owner personally blocked them)
	@UseGuards(AuthGuard)
	@Mutation(() => Comment)
	public async createComment(
		@Args('input') input: CommentInput,
		@AuthMember('_id') memberId: Types.ObjectId, // the commenter always comes from the JWT
	): Promise<Comment> {
		return this.commentService.createComment(memberId, input);
	}

	// the author edits the text of their own comment
	@UseGuards(AuthGuard)
	@Mutation(() => Comment)
	public async updateComment(
		@Args('input') input: CommentUpdate,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Comment> {
		return this.commentService.updateComment(memberId, input);
	}

	// public: comments of one car / article / profile
	@Query(() => Comments)
	public async getComments(@Args('input') input: CommentsInquiry): Promise<Comments> {
		return this.commentService.getComments(input);
	}

	/** ADMIN: only admins delete comments (flowchart) */

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Comment)
	public async removeCommentByAdmin(@Args('commentId') commentId: string): Promise<Comment> {
		return this.commentService.removeCommentByAdmin(shapeIntoMongoObjectId(commentId));
	}
}
