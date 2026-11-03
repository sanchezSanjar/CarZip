import { registerEnumType } from '@nestjs/graphql';

/** what a private message carries. IMAGE and VOICE come in the next steps */
export enum MessageType {
	TEXT = 'TEXT',
}
registerEnumType(MessageType, { name: 'MessageType' });

/** private messages and their conversations are deleted this long after the last message */
export const PRIVATE_MESSAGE_TTL_DAYS = 14;
