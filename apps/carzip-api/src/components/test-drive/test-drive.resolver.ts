import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Types } from 'mongoose';
import { TestDriveService } from './test-drive.service';
import { TestDrive, TestDrives } from '../../libs/dto/test-drive/test-drive';
import { TestDriveInput, TestDrivesInquiry, TestDriveUpdate } from '../../libs/dto/test-drive/test-drive.input';
import { MemberType } from '../../libs/enums/member.enum';
import { AuthMemberData } from '../../libs/types/auth';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthMember } from '../auth/decorators/authMember.decorator';

@Resolver()
export class TestDriveResolver {
	constructor(private readonly testDriveService: TestDriveService) {}

	// Test Drive flowchart: a buyer (USER) asks the dealer for a date
	@Roles(MemberType.USER)
	@UseGuards(RolesGuard)
	@Mutation(() => TestDrive)
	public async requestTestDrive(
		@Args('input') input: TestDriveInput,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<TestDrive> {
		return this.testDriveService.requestTestDrive(memberId, input);
	}

	// the dealer confirms / rejects / completes, the buyer cancels (the service checks who may do what)
	@Roles(MemberType.USER, MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Mutation(() => TestDrive)
	public async updateTestDrive(
		@Args('input') input: TestDriveUpdate,
		@AuthMember() authMember: AuthMemberData,
	): Promise<TestDrive> {
		return this.testDriveService.updateTestDrive(authMember, input);
	}

	// "My test drives": the buyer's requests
	@Roles(MemberType.USER)
	@UseGuards(RolesGuard)
	@Query(() => TestDrives)
	public async getMyTestDrives(
		@Args('input') input: TestDrivesInquiry,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<TestDrives> {
		return this.testDriveService.getMyTestDrives(memberId, input);
	}

	// the dealer's test-drive inbox
	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Query(() => TestDrives)
	public async getAgentTestDrives(
		@Args('input') input: TestDrivesInquiry,
		@AuthMember('_id') sellerId: Types.ObjectId,
	): Promise<TestDrives> {
		return this.testDriveService.getAgentTestDrives(sellerId, input);
	}
}
