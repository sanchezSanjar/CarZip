import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsMongoId, IsOptional, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

@InputType()
class FollowSearch {
	/** getMemberFollowers: followers OF this agent */
	@IsOptional()
	@IsMongoId()
	@Field(() => String, { nullable: true })
	followingId?: string;

	/** getMemberFollowings: agents this member follows */
	@IsOptional()
	@IsMongoId()
	@Field(() => String, { nullable: true })
	followerId?: string;
}

/** page of followers / followings */
@InputType()
export class FollowInquiry {
	@IsInt()
	@Min(1)
	@Field(() => Int)
	page: number;

	@IsInt()
	@Min(1)
	@Max(100)
	@Field(() => Int)
	limit: number;

	@ValidateNested() // without it nothing inside search is validated
	@Type(() => FollowSearch)
	@Field(() => FollowSearch)
	search: FollowSearch;
}
