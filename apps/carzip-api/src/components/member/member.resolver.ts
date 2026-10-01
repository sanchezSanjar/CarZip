import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { MemberService } from './member.service';
import { Member, Members } from '../../libs/dto/member/member';
import { AgentsInquiry, LoginInput, MemberInput, MembersInquiry } from '../../libs/dto/member/member.input';
import { MemberUpdate, MemberUpdateByAdmin } from '../../libs/dto/member/member.update';
import { MemberType } from '../../libs/enums/member.enum';
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
	public async login(@Args('input') input: LoginInput): Promise<Member> {
		return this.memberService.login(input);
	}

	// Authenticated
	@UseGuards(AuthGuard)
	@Query(() => String)
	public checkAuth(@AuthMember('memberNick') memberNick: string): string {
		return `Hi ${memberNick}`;
	}

	// Authorization check
	@Roles(MemberType.USER, MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Query(() => String)
	public checkAuthRoles(@AuthMember() authMember: AuthMemberData): string {
		return `Hi ${authMember.memberNick}, you are ${authMember.memberType} (memberId: ${authMember._id})`;
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

	// Public (guest or logged in): logged-in viewers who are the member or an admin see private fields too
	@UseGuards(WithoutGuard)
	@Query(() => Member)
	public async getMember(
		@Args('targetId') targetId: string, // the profile being viewed (memberId elsewhere = the logged-in member)
		@AuthMember() authMember: AuthMemberData | null,
	): Promise<Member> {
		return this.memberService.getMember(shapeIntoMongoObjectId(targetId), authMember);
	}

	// Public: the dealer directory
	@Query(() => Members)
	public async getAgents(@Args('input') input: AgentsInquiry): Promise<Members> {
		return this.memberService.getAgents(input);
	}

	/** ADMIN */

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => Members)
	public async getAllMembersByAdmin(@Args('input') input: MembersInquiry): Promise<Members> {
		return this.memberService.getAllMembersByAdmin(input);
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
