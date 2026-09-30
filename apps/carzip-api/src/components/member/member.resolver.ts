import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { MemberService } from './member.service';
import { LoginInput, MemberInput } from '../../libs/dto/member/member.input';

@Resolver()
export class MemberResolver {
	constructor(private readonly memberService: MemberService) {}

	@Mutation(() => String)
	public async signup(@Args('input') input: MemberInput): Promise<string> {
		console.log('Mutation: signup');
		return this.memberService.signup(input);
	}

	@Mutation(() => String)
	public async login(@Args('input') input: LoginInput): Promise<string> {
		console.log('Mutation: login');
		return this.memberService.login(input);
	}
}
