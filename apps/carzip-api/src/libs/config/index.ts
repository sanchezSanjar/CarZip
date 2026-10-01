import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { Message } from '../enums/common.enum';

/** id string from the client -> ObjectId. A malformed id is the client's mistake (400), not a server crash. */
export const shapeIntoMongoObjectId = (target: string | Types.ObjectId): Types.ObjectId => {
	if (target instanceof Types.ObjectId) return target;
	if (!Types.ObjectId.isValid(target)) throw new BadRequestException(Message.INVALID_ID);
	return new Types.ObjectId(target);
};
