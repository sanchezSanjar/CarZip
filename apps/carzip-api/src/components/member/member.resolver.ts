import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver, Context } from '@nestjs/graphql';
import type { Request } from 'express';
import { Types } from 'mongoose';
import { MemberService } from './member.service';
import { Member, Members } from '../../libs/dto/member/member';
import {
	AgentInputByAdmin,
	AgentsInquiry,
	ChangePasswordInput,
	ChangePhoneInput,
	LoginInput,
	MemberInput,
	MembersInquiry,
} from '../../libs/dto/member/member.input';
import { MemberUpdate, MemberUpdateByAdmin } from '../../libs/dto/member/member.update';
import { MemberType } from '@app/common/enums/member.enum';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { WithoutGuard } from '../auth/guards/without.guard';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthMemberData } from '../../libs/types/auth';

@Resolver()
export class MemberResolver {
	constructor(private readonly memberService: MemberService) {}

	@Mutation(() => Member)
	public async signup(@Args('input') input: MemberInput): Promise<Member> {
		return this.memberService.signup(input);
	}

	@Mutation(() => Member)
	public async login(@Args('input') input: LoginInput, @Context('req') req: Request): Promise<Member> {
		return this.memberService.login(input, req.ip ?? 'unknown');
	}

	// Authenticated: a member edits their own profile. Who is edited comes from the JWT, never from the input
	@UseGuards(AuthGuard)
	@Mutation(() => Member)
	public async updateMember(
		@Args('input') input: MemberUpdate,
		@AuthMember() authMember: AuthMemberData,
	): Promise<Member> {
		return this.memberService.updateMember(authMember, input);
	}

	// Authenticated: returns the member with a NEW token (other sessions are logged out)
	@UseGuards(AuthGuard)
	@Mutation(() => Member)
	public async changePassword(
		@Args('input') input: ChangePasswordInput,
		@AuthMember() authMember: AuthMemberData,
	): Promise<Member> {
		return this.memberService.changePassword(authMember, input);
	}

	// Authenticated: after requestOtp + verifyOtp with otpPurpose CHANGE_PHONE for the new number
	@UseGuards(AuthGuard)
	@Mutation(() => Member)
	public async changeMemberPhone(
		@Args('input') input: ChangePhoneInput,
		@AuthMember() authMember: AuthMemberData,
	): Promise<Member> {
		return this.memberService.changeMemberPhone(authMember, input);
	}

	// Public (guest or logged in): logged-in viewers who are the member or an admin see private fields too
	@UseGuards(WithoutGuard)
	@Query(() => Member)
	public async getMember(
		@Args('targetId') targetId: string, // the profile being viewed (memberId elsewhere = the logged-in member)
		@AuthMember() authMember: AuthMemberData | null,
	): Promise<Member> {
		return this.memberService.getMember(shapeIntoMongoObjectId(targetId), authMember);
	}

	// like / un-like a member's profile (toggle)
	@UseGuards(AuthGuard)
	@Mutation(() => Member)
	public async likeTargetMember(
		@Args('memberId') targetId: string, // the profile to like
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Member> {
		return this.memberService.likeTargetMember(memberId, shapeIntoMongoObjectId(targetId));
	}

	// Public: the dealer directory. Logged-in viewers also get meLiked on every agent
	@UseGuards(WithoutGuard)
	@Query(() => Members)
	public async getAgents(
		@Args('input') input: AgentsInquiry,
		@AuthMember() authMember: AuthMemberData | null,
	): Promise<Members> {
		return this.memberService.getAgents(input, authMember);
	}

	/** ADMIN */

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => Members)
	public async getAllMembersByAdmin(@Args('input') input: MembersInquiry): Promise<Members> {
		return this.memberService.getAllMembersByAdmin(input);
	}

	// Admin flowchart "Create agent directly": ACTIVE and approved; the dealer sets the password via "Forgot password"
	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Member)
	public async createAgentByAdmin(
		@Args('input') input: AgentInputByAdmin,
		@AuthMember() admin: AuthMemberData,
	): Promise<Member> {
		return this.memberService.createAgentByAdmin(admin, input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Member)
	public async updateMemberByAdmin(
		@Args('input') input: MemberUpdateByAdmin,
		@AuthMember() admin: AuthMemberData,
	): Promise<Member> {
		return this.memberService.updateMemberByAdmin(admin, input);
	}
}
