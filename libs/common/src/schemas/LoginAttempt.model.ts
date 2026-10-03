import { Schema } from 'mongoose';

/**
 * One failed login: which account was tried (the nickname or phone typed, lower-cased) and from which IP.
 * Used to slow down password guessing (see MemberService.login). Deleted automatically after 15 minutes.
 */
const LoginAttemptSchema = new Schema(
	{
		loginKey: { type: String, required: true },
		loginIp: { type: String, required: true },
	},
	{ timestamps: { createdAt: true, updatedAt: false }, collection: 'loginAttempts' },
);

// "how many failures for this account / this IP in the last 15 minutes?"
LoginAttemptSchema.index({ loginKey: 1, createdAt: -1 });
LoginAttemptSchema.index({ loginIp: 1, createdAt: -1 });
// the window is 15 minutes, so older failures are removed by MongoDB itself
LoginAttemptSchema.index({ createdAt: 1 }, { expireAfterSeconds: 15 * 60 });

export default LoginAttemptSchema;
