import { Field, ObjectType } from '@nestjs/graphql';
import { LikeGroup } from '@app/common/enums/like.enum';

/** one member liked one car / article / member (at most once, see Like.model.ts) */
@ObjectType()
export class Like {
	@Field(() => String) _id: string;
	@Field(() => LikeGroup) likeGroup: LikeGroup;
	@Field(() => String) likeRefId: string;
	@Field(() => String) memberId: string;
	@Field(() => Date) createdAt: Date;
	@Field(() => Date) updatedAt: Date;
}

/** "did I like this?" for the logged-in viewer, attached to cars / articles / members in lists and detail pages */
@ObjectType()
export class MeLiked {
	@Field(() => String) memberId: string;
	@Field(() => String) likeRefId: string;
	@Field(() => Boolean) myFavorite: boolean;
}
