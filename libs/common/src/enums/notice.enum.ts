import { registerEnumType } from '@nestjs/graphql';

/** Admin flowchart: Notices / FAQ / Terms, written by admins, read by everyone */
export enum NoticeCategory {
	NOTICE = 'NOTICE', // announcements
	FAQ = 'FAQ',
	TERMS = 'TERMS', // terms of service, privacy policy
}
registerEnumType(NoticeCategory, { name: 'NoticeCategory' });

export enum NoticeStatus {
	HOLD = 'HOLD',
	ACTIVE = 'ACTIVE',
	DELETE = 'DELETE',
}
registerEnumType(NoticeStatus, { name: 'NoticeStatus' });
