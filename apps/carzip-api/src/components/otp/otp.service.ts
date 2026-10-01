import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { Model, Types } from 'mongoose';
import { SmsService } from '../sms/sms.service';
import { AuthService } from '../auth/auth.service';
import { RequestOtpInput, ResetPasswordInput, VerifyOtpInput } from '../../libs/dto/otp/otp.input';
import { VerifyOtpResult } from '../../libs/dto/otp/otp';
import { Member } from '../../libs/dto/member/member';
import { OtpPurpose, OtpStatus } from '../../libs/enums/otp.enum';
import { MemberStatus } from '../../libs/enums/member.enum';
import { Message } from '../../libs/enums/common.enum';

const MINUTE = 60 * 1000;
const CODE_TTL = 3 * MINUTE; // the SMS code
const RESET_TOKEN_TTL = 10 * MINUTE; // the reset token a correct code buys
const SIGNUP_VERIFIED_WINDOW = 15 * MINUTE; // time to fill the signup form after verifying the phone
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN = 1 * MINUTE;
const MAX_PER_PHONE_PER_HOUR = 5; // every code is a paid SMS
const MAX_PER_IP_PER_HOUR = 20;

interface Otp {
	_id: Types.ObjectId;
	otpPurpose: OtpPurpose;
	otpStatus: OtpStatus;
	otpPhone: string;
	otpCodeHash?: string;
	otpAttempts: number;
	memberId?: Types.ObjectId;
	expiresAt: Date;
	createdAt: Date;
}

/**
 * Phone verification by SMS code (flowchart: "Signup & Login", "Forgot Password").
 * - Codes and reset tokens are stored only as hashes: a DB leak gives no usable code.
 * - A weak 6-digit code only buys a strong 32-byte reset token; the token changes the password.
 */
@Injectable()
export class OtpService {
	constructor(
		@InjectModel('Otp') private readonly otpModel: Model<Otp>,
		@InjectModel('Member') private readonly memberModel: Model<Member>,
		private readonly smsService: SmsService,
		private readonly authService: AuthService,
	) {}

	public async requestOtp(input: RequestOtpInput, ip: string): Promise<string> {
		const { otpPhone, otpPurpose } = input;
		await this.checkRateLimit(otpPhone, otpPurpose, ip);

		let memberId: Types.ObjectId | undefined;
		if (otpPurpose === OtpPurpose.SIGNUP) {
			if (await this.memberModel.exists({ memberPhone: otpPhone })) throw new BadRequestException(Message.USED_PHONE);
		} else {
			const member = await this.memberModel
				.findOne({ memberPhone: otpPhone })
				.select('_id memberStatus')
				.lean<{ _id: Types.ObjectId; memberStatus: MemberStatus }>();
			// unknown or inactive number: send nothing, but answer exactly like a real send
			if (member?.memberStatus !== MemberStatus.ACTIVE) return Message.OTP_SENT_IF_REGISTERED;
			memberId = member._id;
		}

		// only the newest code works
		await this.otpModel.updateMany(
			{ otpPhone, otpPurpose, otpStatus: OtpStatus.PENDING },
			{ otpStatus: OtpStatus.EXPIRED },
		);

		const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
		await this.otpModel.create({
			otpPurpose,
			otpPhone,
			otpCodeHash: this.hashCode(otpPhone, code),
			otpIp: ip,
			memberId,
			expiresAt: new Date(Date.now() + CODE_TTL),
		});

		const text = `[CarZip] 인증번호 ${code} (3분 이내 입력)`;
		if (otpPurpose === OtpPurpose.SIGNUP) {
			await this.smsService.sendSms(otpPhone, text);
			return Message.OTP_SENT;
		}
		// reset: don't wait for the SMS, so response time doesn't reveal whether the number is registered.
		// a failed send is already logged by SmsService
		this.smsService.sendSms(otpPhone, text).catch(() => undefined);
		return Message.OTP_SENT_IF_REGISTERED;
	}

	public async verifyOtp(input: VerifyOtpInput): Promise<VerifyOtpResult> {
		const { otpPhone, otpPurpose, otpCode } = input;

		// count the attempt BEFORE comparing, atomically: parallel guesses can't get past MAX_ATTEMPTS
		const otp = await this.otpModel
			.findOneAndUpdate(
				{ otpPhone, otpPurpose, otpStatus: OtpStatus.PENDING },
				{ $inc: { otpAttempts: 1 } },
				{ sort: { createdAt: -1 }, new: true },
			)
			.select('+otpCodeHash')
			.lean<Otp>();
		if (!otp) throw new BadRequestException(Message.OTP_EXPIRED);

		if (otp.expiresAt < new Date() || otp.otpAttempts > MAX_ATTEMPTS) {
			await this.expire(otp._id);
			throw new BadRequestException(Message.OTP_EXPIRED);
		}
		if (!this.codeMatches(otp.otpCodeHash, otpPhone, otpCode)) {
			const attemptsLeft = MAX_ATTEMPTS - otp.otpAttempts;
			if (attemptsLeft <= 0) {
				await this.expire(otp._id);
				throw new BadRequestException(Message.OTP_EXPIRED);
			}
			throw new BadRequestException(`${Message.OTP_WRONG_CODE}. ${attemptsLeft} attempt(s) left.`);
		}

		const verified = { otpStatus: OtpStatus.VERIFIED, verifiedAt: new Date() };
		if (otpPurpose === OtpPurpose.SIGNUP) {
			await this.otpModel.updateOne({ _id: otp._id, otpStatus: OtpStatus.PENDING }, verified);
			return { message: Message.OTP_VERIFIED };
		}

		const resetToken = randomBytes(32).toString('base64url');
		await this.otpModel.updateOne(
			{ _id: otp._id, otpStatus: OtpStatus.PENDING },
			{ ...verified, resetTokenHash: this.sha256(resetToken), expiresAt: new Date(Date.now() + RESET_TOKEN_TTL) },
		);
		return { message: Message.OTP_VERIFIED, resetToken };
	}

	public async resetPassword(input: ResetPasswordInput): Promise<string> {
		// VERIFIED -> USED in one atomic step: a token works exactly once, even with parallel requests
		const otp = await this.otpModel
			.findOneAndUpdate(
				{
					resetTokenHash: this.sha256(input.resetToken),
					otpPurpose: OtpPurpose.RESET_PASSWORD,
					otpStatus: OtpStatus.VERIFIED,
					expiresAt: { $gt: new Date() },
				},
				{ otpStatus: OtpStatus.USED },
			)
			.lean<Otp>();
		if (!otp?.memberId) throw new BadRequestException(Message.RESET_TOKEN_INVALID);

		const result = await this.memberModel.updateOne(
			{ _id: otp.memberId, memberStatus: MemberStatus.ACTIVE },
			{
				memberPassword: await this.authService.hashPassword(input.newPassword),
				passwordChangedAt: new Date(), // AuthGuard now rejects every JWT issued before this moment
			},
		);
		if (!result.matchedCount) throw new BadRequestException(Message.RESET_TOKEN_INVALID);
		return Message.PASSWORD_RESET_DONE;
	}

	/** signup: the phone must have been verified by SMS in the last 15 minutes */
	public async assertPhoneVerified(otpPhone: string): Promise<void> {
		const verified = await this.otpModel.exists({
			otpPhone,
			otpPurpose: OtpPurpose.SIGNUP,
			otpStatus: OtpStatus.VERIFIED,
			verifiedAt: { $gte: new Date(Date.now() - SIGNUP_VERIFIED_WINDOW) },
		});
		if (!verified) throw new BadRequestException(Message.PHONE_NOT_VERIFIED);
	}

	/** signup succeeded: the verification can't be used for another account */
	public async markPhoneUsed(otpPhone: string): Promise<void> {
		await this.otpModel.updateMany(
			{ otpPhone, otpPurpose: OtpPurpose.SIGNUP, otpStatus: OtpStatus.VERIFIED },
			{ otpStatus: OtpStatus.USED },
		);
	}

	private async checkRateLimit(otpPhone: string, otpPurpose: OtpPurpose, ip: string): Promise<void> {
		const hourAgo = new Date(Date.now() - 60 * MINUTE);
		const [last, phoneCount, ipCount] = await Promise.all([
			this.otpModel.findOne({ otpPhone, otpPurpose }).sort({ createdAt: -1 }).select('createdAt').lean<Otp>(),
			this.otpModel.countDocuments({ otpPhone, otpPurpose, createdAt: { $gte: hourAgo } }),
			this.otpModel.countDocuments({ otpIp: ip, createdAt: { $gte: hourAgo } }),
		]);
		if (phoneCount >= MAX_PER_PHONE_PER_HOUR || ipCount >= MAX_PER_IP_PER_HOUR) {
			throw new HttpException(Message.OTP_TOO_MANY_REQUESTS, HttpStatus.TOO_MANY_REQUESTS);
		}
		if (last && last.createdAt.getTime() > Date.now() - RESEND_COOLDOWN) {
			throw new HttpException(Message.OTP_WAIT_BEFORE_RESEND, HttpStatus.TOO_MANY_REQUESTS);
		}
	}

	private async expire(_id: Types.ObjectId): Promise<void> {
		await this.otpModel.updateOne({ _id }, { otpStatus: OtpStatus.EXPIRED });
	}

	/**
	 * HMAC with the server secret, not a plain hash: there are only 1,000,000 six-digit codes,
	 * so a plain sha256 from a leaked DB would be cracked instantly. Bound to the phone number too.
	 */
	private hashCode(otpPhone: string, code: string): string {
		return createHmac('sha256', process.env.SECRET_TOKEN as string)
			.update(`${otpPhone}:${code}`)
			.digest('hex');
	}

	private codeMatches(storedHash: string | undefined, otpPhone: string, code: string): boolean {
		if (!storedHash) return false;
		const expected = Buffer.from(storedHash, 'hex');
		const actual = Buffer.from(this.hashCode(otpPhone, code), 'hex');
		return expected.length === actual.length && timingSafeEqual(expected, actual);
	}

	/** reset tokens are 32 random bytes: a plain sha256 is enough, nothing to brute-force */
	private sha256(value: string): string {
		return createHash('sha256').update(value).digest('hex');
	}
}
