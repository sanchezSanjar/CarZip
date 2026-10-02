import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Types } from 'mongoose';
import { FollowService } from './follow.service';
import { Follower, Followers, Followings } from '../../libs/dto/follow/follow';
import { FollowInquiry } from '../../libs/dto/follow/follow.input';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { AuthGuard } from '../auth/guards/auth.guard';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { WithoutGuard } from '../auth/guards/without.guard';
import { AuthMemberData } from '../../libs/types/auth';

@Resolver()
export class FollowResolver {
	constructor(private readonly followService: FollowService) {}

	// any logged-in member (USER, AGENT, ADMIN) follows an AGENT
	@UseGuards(AuthGuard)
	@Mutation(() => Follower)
	public async subscribe(
		@Args('input') followingId: string, // the agent to follow
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Follower> {
		return this.followService.subscribe(memberId, shapeIntoMongoObjectId(followingId));
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Follower)
	public async unsubscribe(
		@Args('input') followingId: string,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Follower> {
		return this.followService.unsubscribe(memberId, shapeIntoMongoObjectId(followingId));
	}

	// public: whom a member follows. Logged-in viewers also get meLiked per row
	@UseGuards(WithoutGuard)
	@Query(() => Followings)
	public async getMemberFollowings(
		@Args('input') input: FollowInquiry,
		@AuthMember() authMember: AuthMemberData | null,
	): Promise<Followings> {
		return this.followService.getMemberFollowings(input, authMember);
	}

	// public: who follows an agent. Logged-in viewers also get meLiked per row
	@UseGuards(WithoutGuard)
	@Query(() => Followers)
	public async getMemberFollowers(
		@Args('input') input: FollowInquiry,
		@AuthMember() authMember: AuthMemberData | null,
	): Promise<Followers> {
		return this.followService.getMemberFollowers(input, authMember);
	}
}
