import { Schema } from 'mongoose';
import { OtpPurpose, OtpStatus } from '../libs/enums/otp.enum';

const OtpSchema = new Schema(
	{
		otpPurpose: { type: String, enum: OtpPurpose, required: true },
		otpStatus: { type: String, enum: OtpStatus, default: OtpStatus.PENDING },
		otpPhone: { type: String, required: true },
		otpCodeHash: { type: String, required: true, select: false },
		otpAttempts: { type: Number, default: 0 },
		otpIp: { type: String, required: true },
		resetTokenHash: { type: String, select: false },
		memberId: { type: Schema.Types.ObjectId, ref: 'Member' }, // null for SIGNUP
		expiresAt: { type: Date, required: true }, // validity check only, NOT the TTL field
		verifiedAt: { type: Date },
	},
	{ timestamps: true, collection: 'otps' },
);

// rate limiting: "how many codes did this phone get in the last hour?"
OtpSchema.index({ otpPhone: 1, otpPurpose: 1, createdAt: -1 });
// rate limiting per IP: "how many codes did this IP request in the last hour?"
OtpSchema.index({ otpIp: 1, createdAt: -1 });
// step 3 lookup by reset token
OtpSchema.index({ resetTokenHash: 1 }, { sparse: true });
// auto-delete after 24h. TTL is on createdAt, not expiresAt, so rate-limit history survives
OtpSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });

export default OtpSchema;
