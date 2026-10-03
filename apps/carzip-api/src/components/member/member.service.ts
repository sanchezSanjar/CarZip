import { randomBytes } from 'crypto';
import {
	BadRequestException,
	ForbiddenException,
	HttpException,
	HttpStatus,
	Injectable,
	InternalServerErrorException,
	Logger,
	NotFoundException,
	UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
	AgentInputByAdmin,
	AgentsInquiry,
	ChangePasswordInput,
	ChangePhoneInput,
	LoginInput,
	MemberInput,
	MembersInquiry,
} from '../../libs/dto/member/member.input';
import { OtpPurpose } from '@app/common/enums/otp.enum';
import { MemberUpdate, MemberUpdateByAdmin } from '../../libs/dto/member/member.update';
import { AuthMemberData } from '../../libs/types/auth';
import { Member, Members } from '../../libs/dto/member/member';
import { MemberAuthType, MemberStatus, MemberType } from '@app/common/enums/member.enum';
import { Direction, Message } from '@app/common/enums/common.enum';
import { escapeRegex, shapeIntoMongoObjectId } from '../../libs/config';
import { lookupAuthMemberFollowed, lookupAuthMemberLiked } from '../../libs/utils/lookup';
import { AuthService } from '../auth/auth.service';
import { OtpService } from '../otp/otp.service';
import { ViewService } from '../view/view.service';
import { CarService } from '../car/car.service';
import { TestDriveService } from '../test-drive/test-drive.service';
import { NotificationService } from '../notification/notification.service';
import { LikeService } from '../like/like.service';
import { LikeGroup } from '@app/common/enums/like.enum';
import { MeFollowed } from '../../libs/dto/follow/follow';
import { NotificationGroup, NotificationType } from '@app/common/enums/notification.enum';
import { ViewGroup } from '@app/common/enums/view.enum';
import { UploadService } from '../upload/upload.service';
import { UploadTarget } from '@app/common/enums/upload.enum';

// login limit: failed attempts counted over 15 minutes, per account and per IP (many accounts tried from one place)
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_ACCOUNT = 5;
const MAX_FAILURES_PER_IP = 30;

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
	private readonly logger = new Logger('MemberService');

	constructor(
		@InjectModel('Member') private readonly memberModel: Model<Member>,
		@InjectModel('LoginAttempt')
		private readonly loginAttemptModel: Model<{ loginKey: string; loginIp: string; createdAt: Date }>,
		private readonly authService: AuthService,
		private readonly otpService: OtpService,
		private readonly viewService: ViewService,
		private readonly carService: CarService,
		private readonly notificationService: NotificationService,
		private readonly likeService: LikeService,
		@InjectModel('Block') private readonly blockModel: Model<{ blockerId: unknown; blockedId: unknown }>,
		@InjectModel('Follow') private readonly followModel: Model<{ followingId: unknown; followerId: unknown }>,
		private readonly testDriveService: TestDriveService,
		private readonly uploadService: UploadService,
	) {}

	/**
	 * Profile photos and business cards must be images our upload API produced (target member):
	 * no hot-linked or tracking images on profiles. An empty value (photo removed) is allowed.
	 */
	private assertOwnImages(input: { memberImage?: string | null; agentBusinessCard?: string | null }): void {
		if (input.memberImage && !this.uploadService.isUploadedImage(input.memberImage, UploadTarget.MEMBER)) {
			throw new BadRequestException(Message.MEMBER_IMAGE_NOT_UPLOADED);
		}
		if (input.agentBusinessCard && !this.uploadService.isUploadedImage(input.agentBusinessCard, UploadTarget.MEMBER)) {
			throw new BadRequestException(Message.BUSINESS_CARD_NOT_UPLOADED);
		}
	}

	public async signup(input: MemberInput): Promise<Member> {
		// the phone must be verified by SMS first (requestOtp + verifyOtp with purpose SIGNUP)
		await this.otpService.assertPhoneVerified(input.memberPhone);
		this.assertOwnImages(input);
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
			this.logger.error(`signup failed: ${err.message}`, err.stack);
			throw new InternalServerErrorException(Message.CREATE_FAILED);
		}
	}

	/**
	 * Logged-in password change: the old password must be right. passwordChangedAt = now, so every OTHER
	 * session (other phones, a stolen token) is logged out; this device gets a fresh token in the response.
	 */
	public async changePassword(authMember: AuthMemberData, input: ChangePasswordInput): Promise<Member> {
		await this.assertPassword(authMember._id, input.oldPassword);

		const updated = await this.memberModel
			.findOneAndUpdate(
				{ _id: authMember._id, memberStatus: MemberStatus.ACTIVE },
				{ memberPassword: await this.authService.hashPassword(input.newPassword), passwordChangedAt: new Date() },
				{ new: true },
			)
			.lean<Member>()
			.exec();
		if (!updated) throw new BadRequestException(Message.UPDATE_FAILED);
		return { ...updated, accessToken: await this.authService.createToken(updated) };
	}

	/**
	 * Step 3 of the phone change: the NEW number was verified by SMS (CHANGE_PHONE, by this member, in the
	 * last 15 min) and the current password is right. Then login by phone and "forgot password" use the new number.
	 */
	public async changeMemberPhone(authMember: AuthMemberData, input: ChangePhoneInput): Promise<Member> {
		await this.assertPassword(authMember._id, input.memberPassword);
		await this.otpService.assertPhoneVerified(input.newPhone, OtpPurpose.CHANGE_PHONE, authMember._id);

		let updated: Member | null;
		try {
			updated = await this.memberModel
				.findOneAndUpdate(
					{ _id: authMember._id, memberStatus: MemberStatus.ACTIVE },
					{ memberPhone: input.newPhone },
					{ new: true },
				)
				.lean<Member>()
				.exec();
		} catch (err: any) {
			this.throwIfDuplicate(err, Message.UPDATE_FAILED); // someone took the number meanwhile
			throw new InternalServerErrorException(Message.UPDATE_FAILED);
		}
		if (!updated) throw new BadRequestException(Message.UPDATE_FAILED);
		await this.otpService.markPhoneUsed(input.newPhone, OtpPurpose.CHANGE_PHONE);
		return updated;
	}

	/** the member's CURRENT password, for sensitive changes while logged in */
	private async assertPassword(memberId: Types.ObjectId, password: string): Promise<void> {
		const found = await this.memberModel
			.findById(memberId)
			.select('+memberPassword')
			.lean<Member & { memberPassword: string }>()
			.exec();
		if (!found || !(await this.authService.comparePassword(password, found.memberPassword))) {
			throw new BadRequestException(Message.WRONG_PASSWORD);
		}
	}

	public async login(input: LoginInput, ip = 'unknown'): Promise<Member> {
		// slow down password guessing: too many recent failures for this account (or from this IP) are refused first
		const loginKey = String(input.memberPhone ?? input.memberNick ?? '').toLowerCase();
		const since = new Date(Date.now() - LOGIN_WINDOW_MS);
		const [keyFailures, ipFailures] = await Promise.all([
			this.loginAttemptModel.countDocuments({ loginKey, createdAt: { $gte: since } }).exec(),
			this.loginAttemptModel.countDocuments({ loginIp: ip, createdAt: { $gte: since } }).exec(),
		]);
		if (keyFailures >= MAX_FAILURES_PER_ACCOUNT || ipFailures >= MAX_FAILURES_PER_IP) {
			throw new HttpException(Message.LOGIN_TOO_MANY, HttpStatus.TOO_MANY_REQUESTS);
		}
		const failed = async () => {
			await this.loginAttemptModel.create({ loginKey, loginIp: ip });
			return new UnauthorizedException(Message.WRONG_LOGIN);
		};

		const filter = input.memberPhone ? { memberPhone: input.memberPhone } : { memberNick: input.memberNick };
		// memberPassword has select: false, so it must be asked for explicitly
		const found = await this.memberModel
			.findOne(filter)
			.select('+memberPassword')
			.lean<Member & { memberPassword: string }>()
			.exec();

		// same message for "not found" and "wrong password": don't reveal which one was wrong
		if (!found) throw await failed();
		const isMatch = await this.authService.comparePassword(input.memberPassword, found.memberPassword);
		if (!isMatch) throw await failed();
		// the right password: this account's failures are forgotten
		await this.loginAttemptModel.deleteMany({ loginKey }).exec();

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
		this.assertOwnImages(data);

		let updated: Member | null;
		try {
			updated = await this.memberModel
				.findOneAndUpdate({ _id: authMember._id, memberStatus: MemberStatus.ACTIVE }, { $set: data }, { new: true })
				.lean<Member>()
				.exec();
		} catch (err: any) {
			this.throwIfDuplicate(err, Message.UPDATE_FAILED); // e.g. the new nick is taken
			this.logger.error(`updateMember failed: ${err.message}`, err.stack);
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
		if (viewer) {
			member.meLiked = await this.likeService.checkLikeExistence({
				memberId: viewer._id,
				likeRefId: targetId,
				likeGroup: LikeGroup.MEMBER,
			});
			member.meFollowed = await this.checkSubscription(viewer._id, targetId);
			// the Block / Unblock button: only agents block (Personal Block flowchart)
			if (viewer.memberType === MemberType.AGENT && !isSelf) {
				member.meBlocked = !!(await this.blockModel.exists({ blockerId: viewer._id, blockedId: targetId }).exec());
			}
		}
		return member;
	}

	/** public dealer directory: ACTIVE (approved) agents only, never private fields */
	/**
	 * Like / un-like a member's profile (toggle). The liked member's memberLikes follows the real likes,
	 * they get a LIKE notification when liked (not when un-liked). No self-likes, and an agent's
	 * PERSONAL block stops the blocked member from liking them (flowchart).
	 */
	public async likeTargetMember(memberId: Types.ObjectId, targetId: Types.ObjectId): Promise<Member> {
		if (memberId.equals(targetId)) throw new BadRequestException(Message.SELF_LIKE_DENIED);
		const target = await this.memberModel.exists({ _id: targetId, memberStatus: MemberStatus.ACTIVE }).exec();
		if (!target) throw new NotFoundException(Message.NO_DATA_FOUND);
		if (await this.blockModel.exists({ blockerId: targetId, blockedId: memberId }).exec()) {
			throw new ForbiddenException(Message.LIKE_BLOCKED);
		}

		const modifier = await this.likeService.toggleLike({ memberId, likeRefId: targetId, likeGroup: LikeGroup.MEMBER });
		const updated = await this.memberModel
			.findByIdAndUpdate(targetId, { $inc: { memberLikes: modifier } }, { new: true })
			.lean<Member>()
			.exec();
		if (!updated) throw new NotFoundException(Message.NO_DATA_FOUND);

		// once per liker: like -> un-like -> like does not notify again
		if (modifier === 1) {
			await this.notificationService.notifyOnce({
				notificationType: NotificationType.LIKE,
				notificationGroup: NotificationGroup.MEMBER,
				notificationTitle: 'Someone liked your profile',
				authorId: memberId,
				receiverId: targetId,
			});
		}
		// the liker sees the target's public profile only
		for (const key of PRIVATE_FIELDS) delete updated[key];
		return updated;
	}

	/** "do I follow this member?": [{ myFollowing: true }] if followerId follows followingId, [] if not */
	private async checkSubscription(followerId: Types.ObjectId, followingId: Types.ObjectId): Promise<MeFollowed[]> {
		const following = await this.followModel.exists({ followerId, followingId }).exec();
		return following ? [{ followerId: String(followerId), followingId: String(followingId), myFollowing: true }] : [];
	}

	public async getAgents(input: AgentsInquiry, viewer: AuthMemberData | null): Promise<Members> {
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
							// "did I like / do I follow this agent?" per row, one query each
							...(viewer?._id ? [lookupAuthMemberLiked(viewer._id), lookupAuthMemberFollowed(viewer._id)] : []),
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
			if (input.memberStatus === MemberStatus.BLOCK) await this.carService.holdAgentCars(targetId, admin._id);
			if (input.memberStatus === MemberStatus.DELETE) {
				const deletedCars = await this.carService.deleteAgentCars(targetId, admin._id);
				updated.memberCars -= deletedCars; // the response shows the counter after the cars were removed
			}
		}
		// a blocked / deleted buyer's open test-drive requests are cancelled, the dealers are told
		if (input.memberStatus === MemberStatus.BLOCK || input.memberStatus === MemberStatus.DELETE) {
			await this.testDriveService.cancelForBuyer(targetId, 'The buyer is no longer available on CarZip.', admin._id);
		}
		return updated;
	}

	/**
	 * Admin flowchart "Create agent directly": an ACTIVE agent, approved now, without signup and review.
	 * The password is random and never shown to anyone: the dealer sets their own with "Forgot password"
	 * (SMS code to memberPhone), which also proves they own that phone.
	 */
	public async createAgentByAdmin(admin: AuthMemberData, input: AgentInputByAdmin): Promise<Member> {
		this.assertOwnImages(input);
		const data = {
			...input,
			memberType: MemberType.AGENT,
			memberStatus: MemberStatus.ACTIVE,
			memberAuthType: MemberAuthType.PHONE,
			memberPassword: await this.authService.hashPassword(randomBytes(32).toString('hex')),
			agentApprovedAt: new Date(),
			agentBusinessNo: input.agentBusinessNo?.replace(/-/g, ''),
		};
		try {
			const member: Member & { memberPassword?: string } = (await this.memberModel.create(data)).toObject();
			delete member.memberPassword;
			this.logger.log(`admin ${admin.memberNick} created agent ${member.memberNick}`);
			return member;
		} catch (err: any) {
			this.throwIfDuplicate(err, Message.CREATE_FAILED);
			this.logger.error(`createAgentByAdmin failed: ${err.message}`, err.stack);
			throw new InternalServerErrorException(Message.CREATE_FAILED);
		}
	}

	/** MongoDB duplicate key (code 11000) on a unique index -> readable message */
	private throwIfDuplicate(err: any, fallback: Message): void {
		if (err?.code !== 11000) return;
		const field = Object.keys(err.keyPattern ?? {})[0];
		throw new BadRequestException(DUPLICATE_MESSAGES[field] ?? fallback);
	}
}
