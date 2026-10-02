import { Field, ObjectType } from '@nestjs/graphql';
import { AgentPublic } from '../car/car';
import { MeLiked } from '../like/like';
import { TotalCounter } from '../member/member';

/** "do I follow this member?" for the logged-in viewer: one entry with myFollowing = true, or empty */
@ObjectType()
export class MeFollowed {
	@Field(() => String) followerId: string; // the viewer
	@Field(() => String) followingId: string; // the member on the page
	@Field(() => Boolean) myFollowing: boolean;
}

/** one follow, seen from the followed agent: WHO follows them (followerData) */
@ObjectType()
export class Follower {
	@Field(() => String) _id: string;
	@Field(() => String) followingId: string;
	@Field(() => String) followerId: string;
	@Field(() => Date) createdAt: Date;
	@Field(() => Date) updatedAt: Date;

	/** the follower, PUBLIC fields only */
	@Field(() => AgentPublic, { nullable: true }) followerData?: AgentPublic;
	/** for the logged-in viewer: did I like / do I follow this follower? */
	@Field(() => [MeLiked], { nullable: true }) meLiked?: MeLiked[];
	@Field(() => [MeFollowed], { nullable: true }) meFollowed?: MeFollowed[];
}

/** one follow, seen from the follower: WHOM they follow (followingData, always an agent) */
@ObjectType()
export class Following {
	@Field(() => String) _id: string;
	@Field(() => String) followingId: string;
	@Field(() => String) followerId: string;
	@Field(() => Date) createdAt: Date;
	@Field(() => Date) updatedAt: Date;

	/** the followed agent, PUBLIC fields only */
	@Field(() => AgentPublic, { nullable: true }) followingData?: AgentPublic;
	@Field(() => [MeLiked], { nullable: true }) meLiked?: MeLiked[];
	@Field(() => [MeFollowed], { nullable: true }) meFollowed?: MeFollowed[];
}

@ObjectType()
export class Followers {
	@Field(() => [Follower]) list: Follower[];
	@Field(() => [TotalCounter], { nullable: true }) metaCounter?: TotalCounter[];
}

@ObjectType()
export class Followings {
	@Field(() => [Following]) list: Following[];
	@Field(() => [TotalCounter], { nullable: true }) metaCounter?: TotalCounter[];
}
