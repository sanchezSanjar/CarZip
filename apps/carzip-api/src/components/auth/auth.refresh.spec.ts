import { describe, it, expect, beforeEach } from 'vitest';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Types } from 'mongoose';
import { AuthService } from './auth.service';
import { Message } from '@app/common/enums/common.enum';
import { DevicePlatform, MemberStatus, MemberType } from '@app/common/enums/member.enum';
import { JwtPayload } from '../../libs/types/auth';

type Doc = Record<string, any>;

// a mongoose call chain: .select() / .lean() can be chained, .exec() gives the value
const query = (value: unknown) => ({ select: () => query(value), lean: () => query(value), exec: async () => value });

/** the filters AuthService uses: equal, null (= not set), { $gt }, { $ne } */
const matches = (doc: Doc, filter: Doc) =>
	Object.entries(filter).every(([key, condition]) => {
		const value = doc[key];
		if (condition === null) return value == null;
		if (condition && typeof condition === 'object' && '$gt' in condition) return value > condition.$gt;
		if (condition && typeof condition === 'object' && '$ne' in condition) {
			return condition.$ne === null ? value != null : String(value) !== String(condition.$ne);
		}
		return String(value) === String(condition);
	});

/** refreshTokens collection in memory */
function fakeRefreshTokenModel() {
	const docs: Doc[] = [];
	const model = {
		create: async (doc: Doc) => docs.push({ ...doc }),
		findOne: (filter: Doc) => query(docs.find((doc) => matches(doc, filter)) ?? null),
		findOneAndUpdate: (filter: Doc, update: Doc) => {
			const doc = docs.find((d) => matches(d, filter));
			const before = doc ? { ...doc } : null; // like mongoose without { new: true }
			if (doc) Object.assign(doc, update);
			return query(before);
		},
		updateMany: (filter: Doc, update: Doc) => {
			const found = docs.filter((doc) => matches(doc, filter));
			found.forEach((doc) => Object.assign(doc, update));
			return query({ modifiedCount: found.length });
		},
	};
	return { docs, model };
}

const memberId = new Types.ObjectId();
const phone = { deviceId: 'device-phone-1', deviceName: 'Galaxy S24', devicePlatform: DevicePlatform.ANDROID };
const tablet = { deviceId: 'device-tablet-1', devicePlatform: DevicePlatform.IOS };

let member: Doc;
let tokens: ReturnType<typeof fakeRefreshTokenModel>;
let jwt: JwtService;
let auth: AuthService;

beforeEach(() => {
	member = { _id: memberId, memberNick: 'cz_buyer', memberType: MemberType.USER, memberStatus: MemberStatus.ACTIVE };
	tokens = fakeRefreshTokenModel();
	jwt = new JwtService({ secret: 'test-secret', signOptions: { expiresIn: '30d' } });
	const memberModel = {
		findById: (id: unknown) => query(String(id) === String(memberId) ? member : null),
		updateOne: (_filter: Doc, update: Doc) => query(Object.assign(member, update)),
	};
	auth = new AuthService(jwt, memberModel as never, tokens.model as never);
});

const lifetime = (token: string) => {
	const { iat, exp } = jwt.decode<JwtPayload>(token);
	return exp! - iat!;
};
const refused = new UnauthorizedException(Message.NOT_AUTHENTICATED);

describe('AuthService: access tokens', () => {
	it('without a device: one 30-day token, no session in it (the web today)', async () => {
		const token = await auth.createToken(member as never);
		expect(lifetime(token)).toBe(30 * 24 * 60 * 60);
		expect(jwt.decode<JwtPayload>(token).sid).toBeUndefined();
	});

	it('with a device: 15 minutes, and authenticate tells which session it belongs to', async () => {
		const { accessToken } = await auth.startSession(member as never, phone);
		expect(lifetime(accessToken)).toBe(15 * 60);
		const authMember = await auth.authenticate(`Bearer ${accessToken}`);
		expect(authMember.sessionId).toBe(jwt.decode<JwtPayload>(accessToken).sid);
	});
});

describe('AuthService: refresh token sessions', () => {
	it('only the hash of the refresh token is stored, with the device', async () => {
		const { refreshToken } = await auth.startSession(member as never, phone, '1.2.3.4');
		expect(tokens.docs).toHaveLength(1);
		expect(JSON.stringify(tokens.docs)).not.toContain(refreshToken);
		expect(tokens.docs[0]).toMatchObject({
			memberId,
			deviceId: phone.deviceId,
			deviceName: 'Galaxy S24',
			tokenIp: '1.2.3.4',
		});
	});

	it('a refresh gives a new pair in the same session, and the old refresh token is used up', async () => {
		const first = await auth.startSession(member as never, phone);
		const second = await auth.refreshSession(first.refreshToken);
		expect(second.refreshToken).not.toBe(first.refreshToken);
		expect(jwt.decode<JwtPayload>(second.accessToken).sid).toBe(jwt.decode<JwtPayload>(first.accessToken).sid);
		await expect(auth.refreshSession(second.refreshToken)).resolves.toHaveProperty('accessToken');
	});

	it('a used refresh token sent again ends the whole session: the newer token stops working too', async () => {
		const first = await auth.startSession(member as never, phone);
		const second = await auth.refreshSession(first.refreshToken); // e.g. the thief refreshed first
		await expect(auth.refreshSession(first.refreshToken)).rejects.toThrow(refused); // the copy is noticed
		await expect(auth.refreshSession(second.refreshToken)).rejects.toThrow(refused);
	});

	it('reuse ends only that session, the member stays logged in on other devices', async () => {
		const onPhone = await auth.startSession(member as never, phone);
		const onTablet = await auth.startSession(member as never, tablet);
		await auth.refreshSession(onPhone.refreshToken);
		await expect(auth.refreshSession(onPhone.refreshToken)).rejects.toThrow(refused);
		await expect(auth.refreshSession(onTablet.refreshToken)).resolves.toHaveProperty('refreshToken');
	});

	it('an unknown or expired refresh token is refused', async () => {
		await expect(auth.refreshSession('not-a-real-token')).rejects.toThrow(refused);
		const { refreshToken } = await auth.startSession(member as never, phone);
		tokens.docs[0].expiresAt = new Date(Date.now() - 1000);
		await expect(auth.refreshSession(refreshToken)).rejects.toThrow(refused);
	});

	it('logging in again on the same device ends its previous session', async () => {
		const old = await auth.startSession(member as never, phone);
		await auth.startSession(member as never, phone);
		await expect(auth.refreshSession(old.refreshToken)).rejects.toThrow(refused);
	});

	it('a blocked member is refused at the next refresh and the session ends', async () => {
		const { refreshToken } = await auth.startSession(member as never, phone);
		member.memberStatus = MemberStatus.BLOCK;
		await expect(auth.refreshSession(refreshToken)).rejects.toThrow(new ForbiddenException(Message.BLOCKED_MEMBER));
		expect(tokens.docs.every((doc) => doc.revokedAt)).toBe(true);
	});

	it('after a role change, a refresh gives an access token with the new role', async () => {
		const { refreshToken } = await auth.startSession(member as never, phone);
		member.memberType = MemberType.AGENT;
		const { accessToken } = await auth.refreshSession(refreshToken);
		expect(jwt.decode<JwtPayload>(accessToken).memberType).toBe(MemberType.AGENT);
	});
});

describe('AuthService: logout', () => {
	it('logout ends the session of that refresh token only', async () => {
		const onPhone = await auth.startSession(member as never, phone);
		const onTablet = await auth.startSession(member as never, tablet);
		await auth.logout(onPhone.refreshToken);
		await expect(auth.refreshSession(onPhone.refreshToken)).rejects.toThrow(refused);
		await expect(auth.refreshSession(onTablet.refreshToken)).resolves.toHaveProperty('refreshToken');
		await expect(auth.logout('unknown-token')).resolves.toBeUndefined(); // nothing to end, no error
	});

	it('logoutAll ends every session and every access token issued before it, the 30-day ones too', async () => {
		const onPhone = await auth.startSession(member as never, phone);
		const webToken = await auth.createToken(member as never);
		await auth.logoutAll(memberId);
		// the tokens were issued in an earlier second than the logout (iat has whole seconds)
		member.sessionsRevokedAt = new Date(Date.now() + 1000);
		await expect(auth.refreshSession(onPhone.refreshToken)).rejects.toThrow(refused);
		await expect(auth.authenticate(`Bearer ${onPhone.accessToken}`)).rejects.toThrow(refused);
		await expect(auth.authenticate(`Bearer ${webToken}`)).rejects.toThrow(refused);
	});

	it('revokeMemberSessions can keep one session (the device that changed the password)', async () => {
		const onPhone = await auth.startSession(member as never, phone);
		const onTablet = await auth.startSession(member as never, tablet);
		const keep = jwt.decode<JwtPayload>(onPhone.accessToken).sid;
		await auth.revokeMemberSessions(memberId, keep);
		await expect(auth.refreshSession(onPhone.refreshToken)).resolves.toHaveProperty('refreshToken');
		await expect(auth.refreshSession(onTablet.refreshToken)).rejects.toThrow(refused);
	});
});
