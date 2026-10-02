import { Types } from 'mongoose';
import { LikeGroup } from '@app/common/enums/like.enum';

/**
 * server-side only (never sent by a client): the liker always comes from the JWT,
 * so nobody can like on behalf of someone else. The like mutations take just the target id.
 */
export interface LikeInput {
	memberId: Types.ObjectId; // who likes
	likeRefId: Types.ObjectId; // what is liked
	likeGroup: LikeGroup;
}
