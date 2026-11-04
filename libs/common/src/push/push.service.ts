import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DevicePlatform } from '../enums/member.enum';

interface PushTokenDoc {
	token: string;
	memberId: Types.ObjectId;
	sessionId?: string;
	devicePlatform?: DevicePlatform;
}

/** what the phone shows; data tells the app what to open when it is tapped */
export interface PushMessage {
	title: string;
	body?: string;
	data?: Record<string, string>;
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH = 100; // Expo takes at most 100 messages per request
export const EXPO_PUSH_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/;

/**
 * Push notifications through Expo's push service (it talks to Apple and Google for us).
 * Shared by the API and the batch server. Sending is a side effect: a failure is logged, never thrown,
 * so a message or a test-drive change never fails because a push could not go out.
 * EXPO_ACCESS_TOKEN in .env is used when the Expo project has "enhanced push security" on.
 */
@Injectable()
export class PushService {
	private readonly logger = new Logger('PushService');

	constructor(@InjectModel('PushToken') private readonly pushTokenModel: Model<PushTokenDoc>) {}

	/** this phone now belongs to this member and session (a token that was someone else's moves over) */
	public async register(memberId: Types.ObjectId, token: string, sessionId?: string, devicePlatform?: DevicePlatform) {
		await this.pushTokenModel
			.updateOne(
				{ token },
				{ $set: { memberId, sessionId, devicePlatform }, $setOnInsert: { token } },
				{ upsert: true },
			)
			.exec();
	}

	public async unregister(token: string): Promise<void> {
		await this.pushTokenModel.deleteOne({ token }).exec();
	}

	/** the phones of these login sessions stop getting pushes (logout, session revoked) */
	public async removeSessions(sessionIds: string[]): Promise<void> {
		if (sessionIds.length) await this.pushTokenModel.deleteMany({ sessionId: { $in: sessionIds } }).exec();
	}

	/** every phone of the member, except the one of keepSessionId ("log out everywhere", password changes) */
	public async removeMember(memberId: Types.ObjectId, keepSessionId?: string): Promise<void> {
		await this.pushTokenModel
			.deleteMany({ memberId, ...(keepSessionId && { sessionId: { $ne: keepSessionId } }) })
			.exec();
	}

	/** to every phone of these members. Never throws */
	public async sendToMembers(memberIds: Types.ObjectId[], message: PushMessage): Promise<void> {
		try {
			if (!memberIds.length) return;
			const rows = await this.pushTokenModel
				.find({ memberId: { $in: memberIds } })
				.select('token')
				.lean<PushTokenDoc[]>()
				.exec();
			const tokens = [...new Set(rows.map((row) => row.token))];
			for (let i = 0; i < tokens.length; i += BATCH) await this.send(tokens.slice(i, i + BATCH), message);
		} catch (err) {
			this.logger.warn(`push failed: ${(err as Error).message}`);
		}
	}

	private async send(tokens: string[], message: PushMessage): Promise<void> {
		const response = await fetch(EXPO_PUSH_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
				...(process.env.EXPO_ACCESS_TOKEN && { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }),
			},
			body: JSON.stringify(
				tokens.map((to) => ({ to, sound: 'default', priority: 'high', channelId: 'default', ...message })),
			),
		});
		if (!response.ok) throw new Error(`Expo push ${response.status}`);
		const { data } = (await response.json()) as {
			data?: { status: 'ok' | 'error'; details?: { error?: string } }[];
		};
		// the app was deleted or the token changed: Expo says so right away, and the token is dropped
		const gone = tokens.filter((_, i) => data?.[i]?.details?.error === 'DeviceNotRegistered');
		if (gone.length) await this.pushTokenModel.deleteMany({ token: { $in: gone } }).exec();
	}
}
