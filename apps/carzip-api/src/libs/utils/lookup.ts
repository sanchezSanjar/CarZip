import { PipelineStage } from 'mongoose';

/**
 * What anyone may see about a member shown next to their content (car agent, article author) = AgentPublic.
 * Verification data, phone, password hash: never.
 */
export const PUBLIC_MEMBER_FIELDS = [
	'memberNick',
	'memberImage',
	'agentCompany',
	'memberRank',
	'contactPhone',
	'contactEmail',
	'contactTelegram',
	'contactWhatsapp',
	'contactKakao',
];

/**
 * Aggregation stages: attach the member whose id is in `localField` (default memberId) under `as`, PUBLIC fields only.
 * A plain $lookup would copy the whole member, password hash included: aggregate() ignores select: false.
 */
export const lookupPublicMember = (as: string, localField = 'memberId'): PipelineStage.FacetPipelineStage[] => [
	{
		$lookup: {
			from: 'members',
			localField,
			foreignField: '_id',
			as,
			pipeline: [{ $project: Object.fromEntries(PUBLIC_MEMBER_FIELDS.map((field) => [field, 1])) }],
		},
	},
	{ $unwind: { path: `$${as}`, preserveNullAndEmptyArrays: true } },
];
