import { registerEnumType } from '@nestjs/graphql';

export enum NotificationType {
	LIKE = 'LIKE',
	COMMENT = 'COMMENT',
	FOLLOW = 'FOLLOW', // -> agent: someone started following them
	TEST_DRIVE = 'TEST_DRIVE',
	AGENT_APPLICATION = 'AGENT_APPLICATION', // -> admins: new agent is waiting for review
	AGENT_APPROVED = 'AGENT_APPROVED',
	AGENT_REJECTED = 'AGENT_REJECTED',
	CAR_MODERATED = 'CAR_MODERATED', // -> dealer: an admin held / deleted / restored their car
	LISTING_CHECK = 'LISTING_CHECK', // -> dealer: "is this car still for sale?" (batch)
}
registerEnumType(NotificationType, { name: 'NotificationType' });

export enum NotificationStatus {
	WAIT = 'WAIT',
	READ = 'READ',
}
registerEnumType(NotificationStatus, { name: 'NotificationStatus' });

export enum NotificationGroup {
	MEMBER = 'MEMBER',
	ARTICLE = 'ARTICLE',
	CAR = 'CAR',
}
registerEnumType(NotificationGroup, { name: 'NotificationGroup' });
