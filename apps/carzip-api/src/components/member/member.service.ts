import { BadRequestException, ForbiddenException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
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

const AGENT_ONLY_FIELDS = [
	'agentCompany',
	'agentBusinessNo',
	'agentBusinessCard',
	'contactPhone',
	'contactEmail',
	'contactTelegram',
	'contactWhatsapp',
	'contactKakao',
] as const;

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
			// a USER must not carry agent data or public contacts, even if the client sent them
			for (const key of AGENT_ONLY_FIELDS) delete data[key];
		}

		try {
			const created = await this.memberModel.create(data);
			// memberPassword has select: false for queries, but create() still returns it
			const member: Member & { memberPassword?: string } = created.toObject();
			delete member.memberPassword;
			// USER -> logged in right away. AGENT -> PENDING, no token until an admin approves:
			// the client shows "under review" from memberStatus
			if (member.memberStatus === MemberStatus.ACTIVE) {
				member.accessToken = await this.authService.createToken(member);
			}
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
		const filter = input.memberPhone ? { memberPhone: input.memberPhone } : { memberNick: input.memberNick };
		// memberPassword has select: false, so it must be asked for explicitly
		const found = await this.memberModel
			.findOne(filter)
			.select('+memberPassword')
			.lean<Member & { memberPassword: string }>()
			.exec();

		// same message for "not found" and "wrong password": don't reveal which one was wrong
		if (!found) throw new BadRequestException(Message.WRONG_LOGIN);
		const isMatch = await this.authService.comparePassword(input.memberPassword, found.memberPassword);
		if (!isMatch) throw new BadRequestException(Message.WRONG_LOGIN);

		// only after the password matched: tell the real owner why they can't get in. Only ACTIVE gets a token.
		switch (found.memberStatus) {
			case MemberStatus.PENDING:
				throw new ForbiddenException(Message.AGENT_UNDER_REVIEW);
			case MemberStatus.REJECTED: {
				const reason = found.agentRejectReason ? `: ${found.agentRejectReason}` : '';
				throw new ForbiddenException(`${Message.AGENT_REJECTED}${reason}. Please contact admin.`);
			}
			case MemberStatus.BLOCK:
				throw new ForbiddenException(Message.BLOCKED_MEMBER);
			case MemberStatus.DELETE:
				throw new ForbiddenException(Message.ACCOUNT_UNAVAILABLE);
		}

		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { memberPassword, ...member } = found;
		return { ...member, accessToken: await this.authService.createToken(member) };
	}

	public async updateMember(memberId: Types.ObjectId): Promise<string> {
		return `updateMember executed for ${memberId}`;
	}

	public async getMember(): Promise<string> {
		return 'getMember executed';
	}

	/** ADMIN */

	public async getAllMembersByAdmin(): Promise<string> {
		return 'getAllMembersByAdmin executed';
	}

	public async updateMemberByAdmin(): Promise<string> {
		return 'updateMemberByAdmin executed';
	}
}
