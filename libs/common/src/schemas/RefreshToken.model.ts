import { Schema } from 'mongoose';
import { DevicePlatform } from '../enums/member.enum';

/**
 * One refresh token of a logged-in device (the mobile app). Only its SHA-256 hash is stored.
 * A session = one login on one device (sessionId). Every refresh marks the token used and saves a new one
 * with the same sessionId. A used token that comes back was copied: the whole session is revoked (AuthService).
 */
const RefreshTokenSchema = new Schema(
	{
		memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
		sessionId: { type: String, required: true }, // the same for every token of one login
		tokenHash: { type: String, required: true },
		deviceId: { type: String, required: true }, // made by the app once and kept on the device
		deviceName: { type: String },
		devicePlatform: { type: String, enum: DevicePlatform },
		tokenIp: { type: String }, // the IP that got this token (login or refresh)
		usedAt: { type: Date }, // replaced by a newer token of the same session
		revokedAt: { type: Date }, // logout, logout everywhere, password change, reuse detected
		expiresAt: { type: Date, required: true },
	},
	{ timestamps: { createdAt: true, updatedAt: false }, collection: 'refreshTokens' },
);

// refresh / logout look the token up by its hash
RefreshTokenSchema.index({ tokenHash: 1 }, { unique: true });
// revoke one session, or every session of a member (also: the same device logging in again)
RefreshTokenSchema.index({ sessionId: 1 });
RefreshTokenSchema.index({ memberId: 1, deviceId: 1 });
// an expired token is useless, also for reuse detection: MongoDB deletes it by itself
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default RefreshTokenSchema;
