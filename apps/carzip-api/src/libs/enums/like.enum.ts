import { registerEnumType } from '@nestjs/graphql';

export enum LikeGroup {
	MEMBER = 'MEMBER',
	ARTICLE = 'ARTICLE',
	CAR = 'CAR',
}
registerEnumType(LikeGroup, { name: 'LikeGroup' });
