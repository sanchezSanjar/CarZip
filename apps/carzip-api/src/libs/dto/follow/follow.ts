import { Field, ObjectType } from '@nestjs/graphql';

/** "do I follow this member?" for the logged-in viewer: one entry with myFollowing = true, or empty */
@ObjectType()
export class MeFollowed {
	@Field(() => String) followerId: string; // the viewer
	@Field(() => String) followingId: string; // the member on the page
	@Field(() => Boolean) myFollowing: boolean;
}
