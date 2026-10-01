import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	InternalServerErrorException,
	NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AgentsInquiry, LoginInput, MemberInput, MembersInquiry } from '../../libs/dto/member/member.input';
import { MemberUpdate, MemberUpdateByAdmin } from '../../libs/dto/member/member.update';
import { AuthMemberData } from '../../libs/types/auth';
import { Member, Members } from '../../libs/dto/member/member';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';
import { Direction, Message } from '../../libs/enums/common.enum';
import { escapeRegex, shapeIntoMongoObjectId } from '../../libs/config';
import { AuthService } from '../auth/auth.service';
import { OtpService } from '../otp/otp.service';
import { ViewService } from '../view/view.service';
import { CarService } from '../car/car.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationGroup, NotificationType } from '../../libs/enums/notification.enum';
import { ViewGroup } from '../../libs/enums/view.enum';

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

// aggregate() ignores the schema's select: false, so lists must exclude secrets explicitly
const PUBLIC_LIST_PROJECTION = Object.fromEntries(
	['memberPassword', 'passwordChangedAt', ...PRIVATE_FIELDS].map((key) => [key, 0]),
);

// admins see private fields, but never secrets
const ADMIN_LIST_PROJECTION = { memberPassword: 0, passwordChangedAt: 0 };

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
		private readonly viewService: ViewService,
		private readonly carService: CarService,
		private readonly notificationService: NotificationService,
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
			} else if (isAgent) {
				// Signup flowchart: a new agent application -> every admin is notified
				await this.notificationService.notifyAdmins({
					notificationType: NotificationType.AGENT_APPLICATION,
					notificationGroup: NotificationGroup.MEMBER,
					notificationTitle: 'New agent application',
					notificationDesc: `${member.memberNick} (${member.agentCompany}) is waiting for review.`,
					authorId: shapeIntoMongoObjectId(member._id),
				});
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
	public async getMember(targetId: Types.ObjectId, viewer: AuthMemberData | null): Promise<Member> {
		const isAdmin = viewer?.memberType === MemberType.ADMIN;
		const isSelf = !!viewer?._id.equals(targetId);
		const filter = isAdmin || isSelf ? { _id: targetId } : { _id: targetId, memberStatus: MemberStatus.ACTIVE };

		const member = await this.memberModel.findOne(filter).lean<Member>().exec();
		if (!member) throw new NotFoundException(Message.NO_DATA_FOUND);

		// count a profile visit: logged-in viewers only, once per viewer, never your own profile
		if (viewer && !isSelf && member.memberStatus === MemberStatus.ACTIVE) {
			const isNewView = await this.viewService.recordView({
				memberId: viewer._id,
				viewRefId: targetId,
				viewGroup: ViewGroup.MEMBER,
			});
			if (isNewView) {
				await this.memberModel.updateOne({ _id: targetId }, { $inc: { memberViews: 1 } }).exec();
				member.memberViews += 1;
			}
		}

		if (!isAdmin && !isSelf) {
			for (const key of PRIVATE_FIELDS) delete member[key];
		}
		return member;
	}

	/** public dealer directory: ACTIVE (approved) agents only, never private fields */
	public async getAgents(input: AgentsInquiry): Promise<Members> {
		const match: Record<string, unknown> = { memberType: MemberType.AGENT, memberStatus: MemberStatus.ACTIVE };
		const text = input.search?.text?.trim();
		if (text) {
			const pattern = new RegExp(escapeRegex(text), 'i');
			match.$or = [{ memberNick: pattern }, { agentCompany: pattern }];
		}
		const direction = input.direction ?? Direction.DESC;
		// _id breaks ties: many agents share the same views/rank, without it pages could repeat or skip agents
		const sort: Record<string, Direction> = { [input.sort ?? 'createdAt']: direction, _id: direction };

		const [result] = await this.memberModel
			.aggregate<Members>([
				{ $match: match },
				{ $sort: sort },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							{ $project: PUBLIC_LIST_PROJECTION },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();
		// no match is an empty page, not an error
		return result ?? { list: [], metaCounter: [] };
	}

	/** ADMIN */

	public async getAllMembersByAdmin(input: MembersInquiry): Promise<Members> {
		const { memberStatus, memberType, text } = input.search ?? {};
		const match: Record<string, unknown> = {};
		if (memberStatus) match.memberStatus = memberStatus;
		if (memberType) match.memberType = memberType;
		if (text?.trim()) {
			const pattern = new RegExp(escapeRegex(text.trim()), 'i');
			match.$or = [{ memberNick: pattern }, { agentCompany: pattern }, { memberPhone: pattern }];
		}
		const direction = input.direction ?? Direction.DESC;
		const sort: Record<string, Direction> = { [input.sort ?? 'createdAt']: direction, _id: direction };

		const [result] = await this.memberModel
			.aggregate<Members>([
				{ $match: match },
				{ $sort: sort },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							{ $project: ADMIN_LIST_PROJECTION },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();
		return result ?? { list: [], metaCounter: [] };
	}

	/** moderation (Admin flowchart): approve / reject agents, global block, delete, restore */
	public async updateMemberByAdmin(admin: AuthMemberData, input: MemberUpdateByAdmin): Promise<Member> {
		const targetId = shapeIntoMongoObjectId(input._id);
		if (admin._id.equals(targetId)) throw new ForbiddenException(Message.ADMIN_CANNOT_UPDATE_SELF);

		const target = await this.memberModel.findById(targetId).lean<Member>().exec();
		if (!target) throw new NotFoundException(Message.NO_DATA_FOUND);
		if (target.memberType === MemberType.ADMIN) throw new ForbiddenException(Message.ADMIN_CANNOT_UPDATE_ADMIN);

		const $set: Record<string, unknown> = {};
		const $unset: Record<string, ''> = {};
		const finalType = input.memberType ?? target.memberType;
		if (input.memberType) $set.memberType = input.memberType;

		switch (input.memberStatus) {
			case MemberStatus.ACTIVE:
				$set.memberStatus = MemberStatus.ACTIVE;
				$unset.deletedAt = ''; // restoring a deleted member
				if (finalType === MemberType.AGENT && !target.agentApprovedAt) {
					$set.agentApprovedAt = new Date(); // agent application approved
					$unset.agentRejectReason = '';
				}
				break;
			case MemberStatus.REJECTED:
				if (finalType !== MemberType.AGENT) throw new BadRequestException(Message.ONLY_AGENT_CAN_BE_REJECTED);
				$set.memberStatus = MemberStatus.REJECTED;
				$set.agentRejectReason = input.agentRejectReason;
				break;
			case MemberStatus.BLOCK:
				$set.memberStatus = MemberStatus.BLOCK; // AuthGuard reads status from the DB: blocked on the next request
				break;
			case MemberStatus.DELETE:
				$set.memberStatus = MemberStatus.DELETE;
				$set.deletedAt = new Date();
				break;
		}
		if (!Object.keys($set).length) throw new BadRequestException(Message.NOTHING_TO_UPDATE);

		const updated = await this.memberModel
			.findOneAndUpdate({ _id: targetId }, { $set, $unset }, { new: true })
			.lean<Member>()
			.exec();
		if (!updated) throw new BadRequestException(Message.UPDATE_FAILED);

		// Admin flowchart: the agent learns the result of their application
		if ($set.agentApprovedAt || input.memberStatus === MemberStatus.REJECTED) {
			const approved = !!$set.agentApprovedAt;
			await this.notificationService.notify({
				notificationType: approved ? NotificationType.AGENT_APPROVED : NotificationType.AGENT_REJECTED,
				notificationGroup: NotificationGroup.MEMBER,
				notificationTitle: approved ? 'Your agent account is approved' : 'Your agent application was rejected',
				notificationDesc: approved ? 'You can now post cars on CarZip.' : input.agentRejectReason,
				authorId: admin._id,
				receiverId: targetId,
			});
		}

		// Admin flowchart: a blocked agent's cars leave search, a deleted agent's cars are deleted
		if (target.memberType === MemberType.AGENT) {
			if (input.memberStatus === MemberStatus.BLOCK) await this.carService.holdAgentCars(targetId);
			if (input.memberStatus === MemberStatus.DELETE) {
				const deletedCars = await this.carService.deleteAgentCars(targetId);
				updated.memberCars -= deletedCars; // the response shows the counter after the cars were removed
			}
		}
		return updated;
	}

	/** MongoDB duplicate key (code 11000) on a unique index -> readable message */
	private throwIfDuplicate(err: any, fallback: Message): void {
		if (err?.code !== 11000) return;
		const field = Object.keys(err.keyPattern ?? {})[0];
		throw new BadRequestException(DUPLICATE_MESSAGES[field] ?? fallback);
	}
}
