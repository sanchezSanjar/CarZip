import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { MemberService } from './member.service';
import { Member } from '../../libs/dto/member/member';
import { LoginInput, MemberInput } from '../../libs/dto/member/member.input';

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
	@Mutation(() => String)
	public async updateMember(): Promise<string> {
		return this.memberService.updateMember();
	}

	// Authenticated
	@Query(() => String)
	public async getMember(): Promise<string> {
		return this.memberService.getMember();
	}

	/** ADMIN */

	// Authorization: ADMIN
	@Query(() => String)
	public async getAllMembersByAdmin(): Promise<string> {
		return this.memberService.getAllMembersByAdmin();
	}

	// Authorization: ADMIN
	@Mutation(() => String)
	public async updateMemberByAdmin(): Promise<string> {
		return this.memberService.updateMemberByAdmin();
	}
}
