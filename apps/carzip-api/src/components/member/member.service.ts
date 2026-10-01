import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	InternalServerErrorException,
	NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LoginInput, MemberInput } from '../../libs/dto/member/member.input';
import { MemberUpdate } from '../../libs/dto/member/member.update';
import { AuthMemberData } from '../../libs/types/auth';
import { Member } from '../../libs/dto/member/member';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';
import { Message } from '../../libs/enums/common.enum';
import { AuthService } from '../auth/auth.service';
import { OtpService } from '../otp/otp.service';

// unique index field -> message, for MongoDB duplicate key errors (code 11000)
const DUPLICATE_MESSAGES: Record<string, Message> = {
	memberNick: Message.USED_NICK,
	memberPhone: Message.USED_PHONE,
	agentBusinessNo: Message.USED_BUSINESS_NO,
};

// public contacts shown on listings: only agents have them
const CONTACT_FIELDS = ['contactPhone', 'contactEmail', 'contactTelegram', 'contactWhatsapp', 'contactKakao'] as const;

// what other people never see on a profile (only the member themself and admins)
const PRIVATE_FIELDS = [
	'memberPhone',
	'memberFullName',
	'memberWarnings',
	'memberBlocks',
	'agentBusinessNo',
	'agentBusinessCard',
	'agentRejectReason',
	'deletedAt',
] as const;

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
		private readonly otpService: OtpService,
	) {}

	public async signup(input: MemberInput): Promise<Member> {
		// the phone must be verified by SMS first (requestOtp + verifyOtp with purpose SIGNUP)
		await this.otpService.assertPhoneVerified(input.memberPhone);
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
			await this.otpService.markPhoneUsed(input.memberPhone);
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
			this.throwIfDuplicate(err, Message.CREATE_FAILED);
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

	public async updateMember(authMember: AuthMemberData, input: MemberUpdate): Promise<Member> {
		// keep only the fields the client actually sent
		const data: Record<string, string> = Object.fromEntries(
			Object.entries(input).filter(([, value]) => value !== undefined && value !== null),
		);
		if (authMember.memberType !== MemberType.AGENT) {
			for (const key of CONTACT_FIELDS) delete data[key]; // only agents have public contacts
		}
		if (!Object.keys(data).length) throw new BadRequestException(Message.NOTHING_TO_UPDATE);

		let updated: Member | null;
		try {
			updated = await this.memberModel
				.findOneAndUpdate({ _id: authMember._id, memberStatus: MemberStatus.ACTIVE }, { $set: data }, { new: true })
				.lean<Member>()
				.exec();
		} catch (err: any) {
			this.throwIfDuplicate(err, Message.UPDATE_FAILED); // e.g. the new nick is taken
			console.log('Error, Service.updateMember:', err.message);
			throw new InternalServerErrorException(Message.UPDATE_FAILED);
		}
		if (!updated) throw new BadRequestException(Message.UPDATE_FAILED);

		// the token carries memberNick: a new one keeps it in sync after a nick change
		return { ...updated, accessToken: await this.authService.createToken(updated) };
	}

	/**
	 * Public profile. Guests and other members see ACTIVE members only, without private fields.
	 * The member themself and admins see everything (admins also non-ACTIVE members).
	 */
	public async getMember(viewer: AuthMemberData | null, targetId: Types.ObjectId): Promise<Member> {
		const isAdmin = viewer?.memberType === MemberType.ADMIN;
		const isSelf = !!viewer?._id.equals(targetId);
		const filter = isAdmin || isSelf ? { _id: targetId } : { _id: targetId, memberStatus: MemberStatus.ACTIVE };

		const member = await this.memberModel.findOne(filter).lean<Member>().exec();
		if (!member) throw new NotFoundException(Message.NO_DATA_FOUND);

		if (!isAdmin && !isSelf) {
			for (const key of PRIVATE_FIELDS) delete member[key];
		}
		return member;
	}

	/** ADMIN */

	public async getAllMembersByAdmin(): Promise<string> {
		return 'getAllMembersByAdmin executed';
	}

	public async updateMemberByAdmin(): Promise<string> {
		return 'updateMemberByAdmin executed';
	}

	/** MongoDB duplicate key (code 11000) on a unique index -> readable message */
	private throwIfDuplicate(err: any, fallback: Message): void {
		if (err?.code !== 11000) return;
		const field = Object.keys(err.keyPattern ?? {})[0];
		throw new BadRequestException(DUPLICATE_MESSAGES[field] ?? fallback);
	}
}
