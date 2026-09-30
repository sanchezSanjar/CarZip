import { Field, Int, ObjectType } from '@nestjs/graphql';
import { MemberAuthType, MemberStatus, MemberType } from '../../enums/member.enum';

/** A member as the member themself sees it. memberPassword and passwordChangedAt are NEVER here. */
@ObjectType()
export class Member {
	@Field(() => String) _id: string;
	@Field(() => MemberType) memberType: MemberType;
	@Field(() => MemberStatus) memberStatus: MemberStatus;
	@Field(() => MemberAuthType) memberAuthType: MemberAuthType;
	@Field(() => String) memberPhone: string;
	@Field(() => String) memberNick: string;
	@Field(() => String, { nullable: true }) memberFullName?: string;
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
	@Field(() => Int) memberWarnings: number;
	@Field(() => Int) memberBlocks: number;

	// ---- AGENT only
	@Field(() => String, { nullable: true }) agentCompany?: string;
	@Field(() => String, { nullable: true }) agentBusinessNo?: string;
	@Field(() => String, { nullable: true }) agentBusinessCard?: string;
	@Field(() => String, { nullable: true }) agentRejectReason?: string;
	@Field(() => Date, { nullable: true }) agentApprovedAt?: Date;
	@Field(() => String, { nullable: true }) contactPhone?: string;
	@Field(() => String, { nullable: true }) contactEmail?: string;
	@Field(() => String, { nullable: true }) contactTelegram?: string;
	@Field(() => String, { nullable: true }) contactWhatsapp?: string;
	@Field(() => String, { nullable: true }) contactKakao?: string;

	@Field(() => Date, { nullable: true }) deletedAt?: Date;
	@Field(() => Date) createdAt: Date;
	@Field(() => Date) updatedAt: Date;
}
