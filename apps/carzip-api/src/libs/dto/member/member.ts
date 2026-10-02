import { Field, Int, ObjectType } from '@nestjs/graphql';
import { MemberAuthType, MemberStatus, MemberType } from '@app/common/enums/member.enum';
import { MeLiked } from '../like/like';
import { MeFollowed } from '../follow/follow';

/**
 * A member. memberPassword and passwordChangedAt are NEVER here.
 * Fields marked "private" are null unless the viewer is the member themself or an ADMIN (see getMember).
 */
@ObjectType()
export class Member {
	@Field(() => String) _id: string;
	@Field(() => MemberType) memberType: MemberType;
	@Field(() => MemberStatus) memberStatus: MemberStatus;
	@Field(() => MemberAuthType) memberAuthType: MemberAuthType;
	@Field(() => String, { nullable: true }) memberPhone?: string; // private
	@Field(() => String) memberNick: string;
	@Field(() => String, { nullable: true }) memberFullName?: string; // private
	@Field(() => String) memberImage: string;
	@Field(() => String, { nullable: true }) memberAddress?: string;
	@Field(() => String, { nullable: true }) memberDesc?: string;

	@Field(() => Int) memberCars: number;
	@Field(() => Int) memberArticles: number;
	@Field(() => Int) memberFollowers: number;
	@Field(() => Int) memberFollowings: number;
	@Field(() => Int) memberPoints: number;
	@Field(() => Int) memberLikes: number;
	@Field(() => Int) memberViews: number;
	@Field(() => Int) memberComments: number;
	@Field(() => Int) memberRank: number;
	@Field(() => Int, { nullable: true }) memberWarnings?: number; // private
	@Field(() => Int, { nullable: true }) memberBlocks?: number; // private

	// ---- AGENT only
	@Field(() => String, { nullable: true }) agentCompany?: string;
	@Field(() => String, { nullable: true }) agentBusinessNo?: string; // private
	@Field(() => String, { nullable: true }) agentBusinessCard?: string; // private
	@Field(() => String, { nullable: true }) agentRejectReason?: string; // private
	@Field(() => Date, { nullable: true }) agentApprovedAt?: Date;
	@Field(() => String, { nullable: true }) contactPhone?: string;
	@Field(() => String, { nullable: true }) contactEmail?: string;
	@Field(() => String, { nullable: true }) contactTelegram?: string;
	@Field(() => String, { nullable: true }) contactWhatsapp?: string;
	@Field(() => String, { nullable: true }) contactKakao?: string;

	@Field(() => Date, { nullable: true }) deletedAt?: Date; // private
	@Field(() => Date) createdAt: Date;
	@Field(() => Date) updatedAt: Date;

	/** JWT, only returned by signup and login. The client sends it back as "Authorization: Bearer <token>" */
	@Field(() => String, { nullable: true }) accessToken?: string;
	/** "did I like this?" for the logged-in viewer: one entry with myFavorite = true, or empty. null for guests. */
	@Field(() => [MeLiked], { nullable: true }) meLiked?: MeLiked[];
	/** "do I follow this member?" for the logged-in viewer: one entry with myFollowing = true, or empty. null for guests. */
	@Field(() => [MeFollowed], { nullable: true }) meFollowed?: MeFollowed[];
}

@ObjectType()
export class TotalCounter {
	@Field(() => Int, { nullable: true }) total: number;
}

/** a page of members. metaCounter[0].total = how many match in total (for page numbers) */
@ObjectType()
export class Members {
	@Field(() => [Member]) list: Member[];
	@Field(() => [TotalCounter], { nullable: true }) metaCounter?: TotalCounter[];
}
