import type { Request } from 'express';
import { Types } from 'mongoose';
import { MemberStatus, MemberType } from '@app/common/enums/member.enum';

/** what createToken signs and verifyToken returns. iat / exp are added by jsonwebtoken. */
export interface JwtPayload {
	_id: string;
	memberNick: string;
	memberType: MemberType;
	memberStatus: MemberStatus;
	sid?: string; // refresh-token session (login with a device). Missing on the 30-day tokens of the web
	iat?: number; // issued at (seconds): compared with passwordChangedAt / sessionsRevokedAt to kill old tokens
	exp?: number;
}

/** the logged-in member, as guards put it on the request. Read fresh from the DB, not from the token. */
export interface AuthMemberData {
	_id: Types.ObjectId;
	memberNick: string;
	memberType: MemberType;
	memberStatus: MemberStatus;
	sessionId?: string; // the token's session, so a new access token for this device stays in it
}

/** request after a guard ran. authMember is set by the server only, never read from the client's body. */
export type AuthRequest = Request & { authMember?: AuthMemberData | null };
