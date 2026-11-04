import { Schema } from 'mongoose';
import { DevicePlatform } from '../enums/member.enum';

/**
 * A phone that receives push notifications: its Expo push token, whose member it is, and the login
 * session it belongs to. Logging out of that session (or "log out everywhere") removes it, so a phone that is
 * logged out never gets someone's messages.
 */
const PushTokenSchema = new Schema(
	{
		token: { type: String, required: true }, // ExponentPushToken[...]
		memberId: { type: Schema.Types.ObjectId, required: true, ref: 'Member' },
		sessionId: { type: String }, // refresh-token session (AuthService); missing for 30-day web logins
		devicePlatform: { type: String, enum: DevicePlatform },
	},
	{ timestamps: true, collection: 'pushTokens' },
);

// one row per phone: another member logging in on it takes the token over
PushTokenSchema.index({ token: 1 }, { unique: true });
PushTokenSchema.index({ memberId: 1 });
PushTokenSchema.index({ sessionId: 1 }, { sparse: true });
// a phone not seen for 90 days (app deleted, never logged out) is forgotten
PushTokenSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export default PushTokenSchema;
