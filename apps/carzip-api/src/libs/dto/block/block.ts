import { Field, ObjectType } from '@nestjs/graphql';
import { AgentPublic } from '../car/car';
import { TotalCounter } from '../member/member';

/** one PERSONAL block: blockerId (an agent) blocked blockedId on their own cars and profile */
@ObjectType()
export class Block {
	@Field(() => String) _id: string;
	@Field(() => String) blockerId: string;
	@Field(() => String) blockedId: string;
	@Field(() => Date) createdAt: Date;

	/** the blocked member's PUBLIC profile (for the agent's "blocked members" list) */
	@Field(() => AgentPublic, { nullable: true }) blockedData?: AgentPublic;
}

/** a page of the agent's blocks, newest first. metaCounter[0].total = how many in total */
@ObjectType()
export class Blocks {
	@Field(() => [Block]) list: Block[];
	@Field(() => [TotalCounter], { nullable: true }) metaCounter?: TotalCounter[];
}
