import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Types } from 'mongoose';
import { FollowService } from './follow.service';
import { Follower, Followers, Followings } from '../../libs/dto/follow/follow';
import { FollowInquiry } from '../../libs/dto/follow/follow.input';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { AuthGuard } from '../auth/guards/auth.guard';
import { AuthMember } from '../auth/decorators/authMember.decorator';

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

	// public: whom a member follows ("meLiked / meFollowed" for the viewer come in the next commits)
	@Query(() => Followings)
	public async getMemberFollowings(@Args('input') input: FollowInquiry): Promise<Followings> {
		return this.followService.getMemberFollowings(input);
	}

	// public: who follows an agent
	@Query(() => Followers)
	public async getMemberFollowers(@Args('input') input: FollowInquiry): Promise<Followers> {
		return this.followService.getMemberFollowers(input);
	}
}
