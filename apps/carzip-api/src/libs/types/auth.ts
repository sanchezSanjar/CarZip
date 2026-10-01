import type { Request } from 'express';
import { Types } from 'mongoose';
import { MemberStatus, MemberType } from '../enums/member.enum';

/** what createToken signs and verifyToken returns. iat / exp are added by jsonwebtoken. */
export interface JwtPayload {
	_id: string;
	memberNick: string;
	memberType: MemberType;
	memberStatus: MemberStatus;
	iat?: number; // issued at (seconds): compared with passwordChangedAt to kill old tokens
	exp?: number;
}

/** the logged-in member, as guards put it on the request. Read fresh from the DB, not from the token. */
export interface AuthMemberData {
	_id: Types.ObjectId;
	memberNick: string;
	memberType: MemberType;
	memberStatus: MemberStatus;
}

/** request after a guard ran. authMember is set by the server only, never read from the client's body. */
export type AuthRequest = Request & { authMember?: AuthMemberData | null };
