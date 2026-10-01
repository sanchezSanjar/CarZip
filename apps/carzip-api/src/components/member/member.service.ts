import { BadRequestException, ForbiddenException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LoginInput, MemberInput } from '../../libs/dto/member/member.input';
import { Member } from '../../libs/dto/member/member';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';
import { Message } from '../../libs/enums/common.enum';
import { AuthService } from '../auth/auth.service';

// unique index field -> message, for MongoDB duplicate key errors (code 11000)
const DUPLICATE_MESSAGES: Record<string, Message> = {
	memberNick: Message.USED_NICK,
	memberPhone: Message.USED_PHONE,
	agentBusinessNo: Message.USED_BUSINESS_NO,
};

@Injectable()
export class MemberService {
	constructor(
		@InjectModel('Member') private readonly memberModel: Model<Member>,
		private readonly authService: AuthService,
	) {}

	public async signup(input: MemberInput): Promise<Member> {
		const isAgent = input.memberType === MemberType.AGENT;

		const data = {
			...input,
			memberPassword: await this.authService.hashPassword(input.memberPassword),
			// agents wait for admin approval before they can post cars
			memberStatus: isAgent ? MemberStatus.PENDING : MemberStatus.ACTIVE,
			// store digits only, so "123-45-67890" and "1234567890" hit the same unique index
			agentBusinessNo: input.agentBusinessNo?.replace(/-/g, ''),
		};
		if (!isAgent) {
			// a USER must not carry agent data, even if the client sent it
			delete data.agentCompany;
			delete data.agentBusinessNo;
			delete data.agentBusinessCard;
		}

		try {
			const created = await this.memberModel.create(data);
			// memberPassword has select: false for queries, but create() still returns it
			const member: Member & { memberPassword?: string } = created.toObject();
			delete member.memberPassword;
			member.accessToken = await this.authService.createToken(member);
			return member;
		} catch (err: any) {
			if (err?.code === 11000) {
				const field = Object.keys(err.keyPattern ?? {})[0];
				throw new BadRequestException(DUPLICATE_MESSAGES[field] ?? Message.CREATE_FAILED);
			}
			console.log('Error, Service.signup:', err.message);
			throw new InternalServerErrorException(Message.CREATE_FAILED);
		}
	}

	public async login(input: LoginInput): Promise<Member> {
		// memberPassword has select: false, so it must be asked for explicitly
		const found = await this.memberModel
			.findOne({ memberNick: input.memberNick })
			.select('+memberPassword')
			.lean<Member & { memberPassword: string }>()
			.exec();

		// same message for "no such nick" and "wrong password": don't reveal which one was wrong
		if (!found || found.memberStatus === MemberStatus.DELETE) {
			throw new BadRequestException(Message.WRONG_LOGIN);
		}
		const isMatch = await this.authService.comparePassword(input.memberPassword, found.memberPassword);
		if (!isMatch) throw new BadRequestException(Message.WRONG_LOGIN);

		// PENDING / REJECTED agents may log in to see their application status; posting cars is checked elsewhere
		if (found.memberStatus === MemberStatus.BLOCK) {
			throw new ForbiddenException(Message.BLOCKED_MEMBER);
		}

		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { memberPassword, ...member } = found;
		return { ...member, accessToken: await this.authService.createToken(member) };
	}
}
