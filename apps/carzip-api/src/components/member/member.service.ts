import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { hash } from 'bcryptjs';
import { Model } from 'mongoose';
import { LoginInput, MemberInput } from '../../libs/dto/member/member.input';
import { Member } from '../../libs/dto/member/member';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';
import { Message } from '../../libs/enums/common.enum';

const SALT_ROUNDS = 10;

// unique index field -> message, for MongoDB duplicate key errors (code 11000)
const DUPLICATE_MESSAGES: Record<string, Message> = {
	memberNick: Message.USED_NICK,
	memberPhone: Message.USED_PHONE,
	agentBusinessNo: Message.USED_BUSINESS_NO,
};

@Injectable()
export class MemberService {
	constructor(@InjectModel('Member') private readonly memberModel: Model<Member>) {}

	public async signup(input: MemberInput): Promise<Member> {
		const isAgent = input.memberType === MemberType.AGENT;

		const data = {
			...input,
			memberPassword: await hash(input.memberPassword, SALT_ROUNDS),
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

	public async login(input: LoginInput): Promise<string> {
		return `login executed for ${input.memberNick}`;
	}
}
