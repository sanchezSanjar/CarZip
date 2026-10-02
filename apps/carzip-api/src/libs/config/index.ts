import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { Message } from '@app/common/enums/common.enum';

/** id string from the client -> ObjectId. A malformed id is the client's mistake (400), not a server crash. */
export const shapeIntoMongoObjectId = (target: string | Types.ObjectId): Types.ObjectId => {
	if (target instanceof Types.ObjectId) return target;
	if (!Types.ObjectId.isValid(target)) throw new BadRequestException(Message.INVALID_ID);
	return new Types.ObjectId(target);
};

/** what getAgents may be sorted by: only indexed / counter fields, never anything private */
export const availableAgentSorts = ['createdAt', 'updatedAt', 'memberCars', 'memberLikes', 'memberViews', 'memberRank'];

/** what getAllMembersByAdmin may be sorted by */
export const availableMemberSorts = [
	'createdAt',
	'updatedAt',
	'memberCars',
	'memberLikes',
	'memberViews',
	'memberRank',
	'memberWarnings',
	'memberBlocks', // how many agents blocked the member: a moderation signal
];

/** what board article lists may be sorted by */
export const availableBoardArticleSorts = ['createdAt', 'updatedAt', 'articleLikes', 'articleViews', 'articleComments'];

/** what comment lists may be sorted by */
export const availableCommentSorts = ['createdAt', 'updatedAt'];

/** what notice lists may be sorted by */
export const availableNoticeSorts = ['createdAt', 'updatedAt'];

/** what test-drive lists may be sorted by */
export const availableTestDriveSorts = ['createdAt', 'testDriveDate'];

/**
 * User text -> a regex that matches it LITERALLY. Never pass search text straight into new RegExp():
 * a crafted pattern like "(a+)+$" can freeze the database (ReDoS), and "." or "*" would change the meaning.
 */
export const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
