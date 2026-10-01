import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { compare, genSalt, hash } from 'bcryptjs';
import { Model, Types } from 'mongoose';
import { Member } from '../../libs/dto/member/member';
import { AuthMemberData, JwtPayload } from '../../libs/types/auth';
import { Message } from '../../libs/enums/common.enum';
import { MemberStatus } from '../../libs/enums/member.enum';

type MemberAuthFields = AuthMemberData & { passwordChangedAt?: Date };

@Injectable()
export class AuthService {
	constructor(
		private readonly jwtService: JwtService,
		@InjectModel('Member') private readonly memberModel: Model<Member>,
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
	 */
	public async createToken(member: Member): Promise<string> {
		const payload: JwtPayload = {
			_id: String(member._id),
			memberNick: member.memberNick,
			memberType: member.memberType,
			memberStatus: member.memberStatus,
		};
		return this.jwtService.signAsync(payload);
	}

	/** throws if the token is invalid, tampered with or expired */
	public async verifyToken(token: string): Promise<JwtPayload> {
		return this.jwtService.verifyAsync<JwtPayload>(token);
	}

	/**
	 * "Authorization: Bearer <token>" header -> the logged-in member, or an error.
	 * A token lives 30 days, so status and role are read from the DB on every request:
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
			.select('memberNick memberType memberStatus passwordChangedAt')
			.lean<MemberAuthFields>()
			.exec();

		// only ACTIVE members are logged in. PENDING / REJECTED agents never get a token,
		// and a member who stops being ACTIVE loses access on the next request
		if (member?.memberStatus === MemberStatus.BLOCK) throw new ForbiddenException(Message.BLOCKED_MEMBER);
		if (member?.memberStatus !== MemberStatus.ACTIVE) throw new UnauthorizedException(Message.NOT_AUTHENTICATED);
		// password was reset after this token was issued -> every old token stops working (iat is in seconds)
		if (member.passwordChangedAt && Math.floor(member.passwordChangedAt.getTime() / 1000) > (payload.iat ?? 0)) {
			throw new UnauthorizedException(Message.NOT_AUTHENTICATED);
		}

		const { _id, memberNick, memberType, memberStatus } = member;
		return { _id, memberNick, memberType, memberStatus };
	}
}
