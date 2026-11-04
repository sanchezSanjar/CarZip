import { registerEnumType } from '@nestjs/graphql';

/** what a private message carries. VOICE comes in the next step */
export enum MessageType {
	TEXT = 'TEXT',
	IMAGE = 'IMAGE', // a photo, with an optional caption in messageText
}
registerEnumType(MessageType, { name: 'MessageType' });

/** private messages and their conversations are deleted this long after the last message */
export const PRIVATE_MESSAGE_TTL_DAYS = 14;
