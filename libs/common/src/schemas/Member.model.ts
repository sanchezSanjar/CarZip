import { Schema } from 'mongoose';
import { MemberAuthType, MemberStatus, MemberType } from '../enums/member.enum';

const MemberSchema = new Schema(
	{
		memberType: { type: String, enum: MemberType, default: MemberType.USER },
		// USER signup -> ACTIVE. AGENT signup -> PENDING until an admin approves.
		memberStatus: { type: String, enum: MemberStatus, default: MemberStatus.ACTIVE },
		memberAuthType: { type: String, enum: MemberAuthType, default: MemberAuthType.PHONE },

		memberPhone: { type: String, required: true },
		memberNick: { type: String, required: true },
		// select: false -> never returned by queries unless you explicitly ask with .select('+memberPassword')
		memberPassword: { type: String, required: true, select: false },
		memberFullName: { type: String },
		memberImage: { type: String, default: '' },
		memberAddress: { type: String },
		memberDesc: { type: String },

		memberCars: { type: Number, default: 0 },
		memberArticles: { type: Number, default: 0 },
		memberFollowers: { type: Number, default: 0 },
		memberFollowings: { type: Number, default: 0 },
		memberPoints: { type: Number, default: 0 },
		memberLikes: { type: Number, default: 0 },
		memberViews: { type: Number, default: 0 },
		memberComments: { type: Number, default: 0 },
		memberRank: { type: Number, default: 0 },
		memberWarnings: { type: Number, default: 0 },
		memberBlocks: { type: Number, default: 0 },

		// ---- AGENT only: verification (seen by admin, NOT public) ----
		agentCompany: { type: String },
		agentBusinessNo: { type: String }, // 사업자등록번호 — admin checks it is real & active
		agentBusinessCard: { type: String }, // image URL
		agentRejectReason: { type: String },
		agentApprovedAt: { type: Date },

		// ---- AGENT only: PUBLIC contact channels shown on listings & agent page ----
		contactPhone: { type: String },
		contactEmail: { type: String },
		contactTelegram: { type: String },
		contactWhatsapp: { type: String },
		contactKakao: { type: String },

		// JWTs issued before this time must be rejected (set on password reset)
		passwordChangedAt: { type: Date },
		deletedAt: { type: Date },
	},
	{ timestamps: true, collection: 'members' },
);

MemberSchema.index({ memberPhone: 1 }, { unique: true });
MemberSchema.index({ memberNick: 1 }, { unique: true });
// one agent account per business
MemberSchema.index({ agentBusinessNo: 1 }, { unique: true, sparse: true });
// agents list page & admin "pending applications" page
MemberSchema.index({ memberType: 1, memberStatus: 1, memberRank: -1 });

export default MemberSchema;
