import { PipelineStage, Types } from 'mongoose';

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

/**
 * "did I like this?" for a whole LIST in one query: adds meLiked to every document,
 * [{ memberId, likeRefId, myFavorite: true }] if the viewer liked it, [] if not.
 * targetRefId: the field holding the liked item's id (default the document's own _id).
 */
export const lookupAuthMemberLiked = (
	memberId: Types.ObjectId,
	targetRefId = '$_id',
): PipelineStage.FacetPipelineStage => ({
	$lookup: {
		from: 'likes',
		let: { localLikeRefId: targetRefId, localMemberId: memberId, localMyFavorite: true },
		pipeline: [
			{
				$match: {
					$expr: {
						$and: [{ $eq: ['$likeRefId', '$$localLikeRefId'] }, { $eq: ['$memberId', '$$localMemberId'] }],
					},
				},
			},
			{ $project: { _id: 0, memberId: 1, likeRefId: 1, myFavorite: '$$localMyFavorite' } },
		],
		as: 'meLiked',
	},
});

/**
 * "do I follow this one?" for a whole LIST in one query: adds meFollowed to every document,
 * [{ followerId, followingId, myFollowing: true }] if the viewer follows them, [] if not.
 * followingId: the field holding the member shown in the row (default the document's own _id).
 */
export const lookupAuthMemberFollowed = (
	followerId: Types.ObjectId,
	followingId = '$_id',
): PipelineStage.FacetPipelineStage => ({
	$lookup: {
		from: 'follows',
		let: { localFollowerId: followerId, localFollowingId: followingId, localMyFollowing: true },
		pipeline: [
			{
				$match: {
					$expr: {
						$and: [{ $eq: ['$followerId', '$$localFollowerId'] }, { $eq: ['$followingId', '$$localFollowingId'] }],
					},
				},
			},
			{ $project: { _id: 0, followerId: 1, followingId: 1, myFollowing: '$$localMyFollowing' } },
		],
		as: 'meFollowed',
	},
});
