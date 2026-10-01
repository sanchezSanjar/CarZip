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
