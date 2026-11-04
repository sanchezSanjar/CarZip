import { createHash, randomBytes, randomUUID } from 'crypto';
import { ForbiddenException, Injectable, Logger, Optional, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { compare, genSalt, hash } from 'bcryptjs';
import { Model, Types } from 'mongoose';
import { Member } from '../../libs/dto/member/member';
import { DeviceInput } from '../../libs/dto/auth/auth.input';
import { AuthTokens } from '../../libs/dto/auth/auth';
import { AuthMemberData, JwtPayload } from '../../libs/types/auth';
import { Message } from '@app/common/enums/common.enum';
import { DevicePlatform, MemberStatus } from '@app/common/enums/member.enum';
import { PushService } from '@app/common/push/push.service';

type MemberAuthFields = AuthMemberData & { passwordChangedAt?: Date; sessionsRevokedAt?: Date };

/** what goes into an access token */
type TokenMember = Pick<AuthMemberData, 'memberNick' | 'memberType' | 'memberStatus'> & { _id: unknown };

/** one stored refresh token (RefreshToken.model) */
interface RefreshTokenDoc {
	memberId: Types.ObjectId;
	sessionId: string;
	tokenHash: string;
	deviceId: string;
	deviceName?: string;
	devicePlatform?: DevicePlatform;
	tokenIp?: string;
	usedAt?: Date;
	revokedAt?: Date;
	expiresAt: Date;
}

// login with a device: a stolen access token works 15 minutes at most, the refresh token gets the next one
const ACCESS_TOKEN_TTL = 15 * 60; // seconds
const REFRESH_TOKEN_TTL = 60 * 24 * 60 * 60 * 1000; // 60 days, counted again from every refresh

@Injectable()
export class AuthService {
	private readonly logger = new Logger('AuthService');

	constructor(
		private readonly jwtService: JwtService,
		@InjectModel('Member') private readonly memberModel: Model<Member>,
		@InjectModel('RefreshToken') private readonly refreshTokenModel: Model<RefreshTokenDoc>,
		// optional: unit tests build the service without it
		@Optional() private readonly push?: PushService,
	) {}

	public async hashPassword(memberPassword: string): Promise<string> {
		const salt = await genSalt(10);
		return hash(memberPassword, salt);
	}

	public async comparePassword(password: string, hashedPassword: string): Promise<boolean> {
		return compare(password, hashedPassword);
	}

	/**
	 * Only what guards need goes in the token. A JWT is signed, NOT encrypted: anyone can base64-decode it,
	 * so phone, business number etc. never go in here. Fresh profile data comes from the DB.
	 * With a sessionId (login with a device): 15 minutes and the session in "sid". Without: 30 days (the web today).
	 */
	public async createToken(member: TokenMember, sessionId?: string): Promise<string> {
		const payload: JwtPayload = {
			_id: String(member._id),
			memberNick: member.memberNick,
			memberType: member.memberType,
			memberStatus: member.memberStatus,
		};
		if (!sessionId) return this.jwtService.signAsync(payload);
		return this.jwtService.signAsync({ ...payload, sid: sessionId }, { expiresIn: ACCESS_TOKEN_TTL });
	}

	/** throws if the token is invalid, tampered with or expired */
	public async verifyToken(token: string): Promise<JwtPayload> {
		return this.jwtService.verifyAsync<JwtPayload>(token);
	}

	/**
	 * "Authorization: Bearer <token>" header -> the logged-in member, or an error.
	 * A token lives up to 30 days, so status and role are read from the DB on every request:
	 * a member blocked, deleted or promoted today is treated as such today, not in 30 days.
	 */
	public async authenticate(authorization?: string): Promise<AuthMemberData> {
		const [scheme, token] = authorization?.split(' ') ?? [];
		if (scheme?.toLowerCase() !== 'bearer' || !token) throw new UnauthorizedException(Message.TOKEN_NOT_EXIST);

		let payload: JwtPayload;
		try {
			payload = await this.verifyToken(token);
		} catch {
			throw new UnauthorizedException(Message.NOT_AUTHENTICATED); // bad signature, expired, malformed
		}

		const member = await this.memberModel
			.findById(new Types.ObjectId(payload._id))
			.select('memberNick memberType memberStatus passwordChangedAt sessionsRevokedAt')
			.lean<MemberAuthFields>()
			.exec();

		// only ACTIVE members are logged in. PENDING / REJECTED agents never get a token,
		// and a member who stops being ACTIVE loses access on the next request
		if (member?.memberStatus === MemberStatus.BLOCK) throw new ForbiddenException(Message.BLOCKED_MEMBER);
		if (member?.memberStatus !== MemberStatus.ACTIVE) throw new UnauthorizedException(Message.NOT_AUTHENTICATED);
		// password changed / reset or "log out everywhere" after this token was issued -> it stops working (iat is in seconds)
		const notBefore = Math.max(member.passwordChangedAt?.getTime() ?? 0, member.sessionsRevokedAt?.getTime() ?? 0);
		if (Math.floor(notBefore / 1000) > (payload.iat ?? 0)) throw new UnauthorizedException(Message.NOT_AUTHENTICATED);

		// an admin changed the role (USER <-> AGENT) after this token was issued: refresh (or log in again) for the new role
		if (payload.memberType && payload.memberType !== member.memberType) {
			throw new UnauthorizedException(Message.NOT_AUTHENTICATED);
		}

		const { _id, memberNick, memberType, memberStatus } = member;
		return { _id, memberNick, memberType, memberStatus, ...(payload.sid && { sessionId: payload.sid }) };
	}

	/**
	 * Login (or signup) with a device: a new session, a 15-minute access token and a refresh token.
	 * The same device logging in again (other account, or the same one) ends its previous session.
	 */
	public async startSession(member: TokenMember, device: DeviceInput, ip?: string): Promise<AuthTokens> {
		const memberId = new Types.ObjectId(String(member._id));
		await this.refreshTokenModel
			.updateMany({ memberId, deviceId: device.deviceId, revokedAt: null }, { revokedAt: new Date() })
			.exec();

		const sessionId = randomUUID();
		const { deviceId, deviceName, devicePlatform } = device;
		const refreshToken = await this.saveRefreshToken({
			memberId,
			sessionId,
			deviceId,
			deviceName,
			devicePlatform,
			tokenIp: ip,
		});
		return { accessToken: await this.createToken(member, sessionId), refreshToken };
	}

	/**
	 * refreshTokens: a refresh token is swapped for a new pair, and works only ONCE.
	 * A used token that comes back means someone has a copy (a leaked backup, a stolen phone...):
	 * the whole session ends, for the copy and for the real owner, who logs in again.
	 */
	public async refreshSession(refreshToken: string, ip?: string): Promise<AuthTokens> {
		const now = new Date();
		const tokenHash = this.sha256(refreshToken);
		// unused -> used in one atomic step: two requests with the same token can't both get new tokens
		const current = await this.refreshTokenModel
			.findOneAndUpdate({ tokenHash, usedAt: null, revokedAt: null, expiresAt: { $gt: now } }, { usedAt: now })
			.lean<RefreshTokenDoc>()
			.exec();

		if (!current) {
			const reused = await this.refreshTokenModel
				.findOne({ tokenHash, usedAt: { $ne: null } })
				.lean<RefreshTokenDoc>()
				.exec();
			if (reused) {
				this.logger.warn(`used refresh token sent again: session ${reused.sessionId} of ${reused.memberId} revoked`);
				await this.revokeSession(reused.sessionId);
			}
			throw new UnauthorizedException(Message.NOT_AUTHENTICATED);
		}

		// blocked, deleted or another role since the last refresh: read fresh, like on every request
		const member = await this.memberModel
			.findById(current.memberId)
			.select('memberNick memberType memberStatus')
			.lean<MemberAuthFields>()
			.exec();
		if (member?.memberStatus !== MemberStatus.ACTIVE) {
			await this.revokeSession(current.sessionId);
			if (member?.memberStatus === MemberStatus.BLOCK) throw new ForbiddenException(Message.BLOCKED_MEMBER);
			throw new UnauthorizedException(Message.NOT_AUTHENTICATED);
		}

		const { memberId, sessionId, deviceId, deviceName, devicePlatform } = current;
		const next = await this.saveRefreshToken({
			memberId,
			sessionId,
			deviceId,
			deviceName,
			devicePlatform,
			tokenIp: ip,
		});
		return { accessToken: await this.createToken(member, sessionId), refreshToken: next };
	}

	/** logout on one device: the session of this refresh token ends. An unknown token is simply ignored */
	public async logout(refreshToken: string): Promise<void> {
		const token = await this.refreshTokenModel
			.findOne({ tokenHash: this.sha256(refreshToken) })
			.select('sessionId')
			.lean<RefreshTokenDoc>()
			.exec();
		if (token) await this.revokeSession(token.sessionId);
	}

	/** "log out everywhere": every refresh token ends, and every access token issued until now (the web's 30-day ones too) */
	public async logoutAll(memberId: Types.ObjectId): Promise<void> {
		await this.memberModel.updateOne({ _id: memberId }, { sessionsRevokedAt: new Date() }).exec();
		await this.revokeMemberSessions(memberId);
	}

	/** every session of the member ends, except keepSessionId (changePassword keeps the device that changed it) */
	public async revokeMemberSessions(memberId: Types.ObjectId, keepSessionId?: string): Promise<void> {
		await this.refreshTokenModel
			.updateMany(
				{ memberId, revokedAt: null, ...(keepSessionId && { sessionId: { $ne: keepSessionId } }) },
				{ revokedAt: new Date() },
			)
			.exec();
		await this.push?.removeMember(memberId, keepSessionId); // those phones stop getting pushes too
	}

	private async revokeSession(sessionId: string): Promise<void> {
		await this.refreshTokenModel.updateMany({ sessionId, revokedAt: null }, { revokedAt: new Date() }).exec();
		await this.push?.removeSessions([sessionId]);
	}

	/** a new random refresh token (256 bits) for the session. Only its hash is saved */
	private async saveRefreshToken(data: Omit<RefreshTokenDoc, 'tokenHash' | 'expiresAt'>): Promise<string> {
		const refreshToken = randomBytes(32).toString('base64url');
		await this.refreshTokenModel.create({
			...data,
			tokenHash: this.sha256(refreshToken),
			expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL),
		});
		return refreshToken;
	}

	// a random 256-bit token can't be guessed, so a plain hash is enough (no bcrypt): a DB leak gives no usable token
	private sha256(value: string): string {
		return createHash('sha256').update(value).digest('hex');
	}
}
