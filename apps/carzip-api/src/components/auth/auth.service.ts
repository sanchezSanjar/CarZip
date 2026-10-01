import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, genSalt, hash } from 'bcryptjs';
import { Member } from '../../libs/dto/member/member';
import { JwtPayload } from '../../libs/types/auth';

@Injectable()
export class AuthService {
	constructor(private readonly jwtService: JwtService) {}

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
}
