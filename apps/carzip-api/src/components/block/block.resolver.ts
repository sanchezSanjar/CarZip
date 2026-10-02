import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Types } from 'mongoose';
import { BlockService } from './block.service';
import { Block, Blocks } from '../../libs/dto/block/block';
import { OrdinaryInquiry } from '../../libs/dto/car/car.input';
import { MemberType } from '@app/common/enums/member.enum';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthMember } from '../auth/decorators/authMember.decorator';

/** Personal Block flowchart: only agents block, and only for their own cars and profile */
@Resolver()
export class BlockResolver {
	constructor(private readonly blockService: BlockService) {}

	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Mutation(() => Block)
	public async blockMember(
		@Args('memberId') memberId: string,
		@AuthMember('_id') agentId: Types.ObjectId,
	): Promise<Block> {
		return this.blockService.blockMember(agentId, shapeIntoMongoObjectId(memberId));
	}

	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Mutation(() => Block)
	public async unblockMember(
		@Args('memberId') memberId: string,
		@AuthMember('_id') agentId: Types.ObjectId,
	): Promise<Block> {
		return this.blockService.unblockMember(agentId, shapeIntoMongoObjectId(memberId));
	}

	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Query(() => Blocks)
	public async getMyBlocks(
		@Args('input') input: OrdinaryInquiry,
		@AuthMember('_id') agentId: Types.ObjectId,
	): Promise<Blocks> {
		return this.blockService.getMyBlocks(agentId, input);
	}
}
