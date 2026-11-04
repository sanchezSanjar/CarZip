import { Field, Int, ObjectType } from '@nestjs/graphql';
import { MemberType } from '@app/common/enums/member.enum';
import { MessageType } from '@app/common/enums/conversation.enum';
import { CarStatus } from '@app/common/enums/car.enum';

/** the other side of a conversation: public profile only */
@ObjectType()
export class ChatPartner {
	@Field(() => String) _id: string;
	@Field(() => String) memberNick: string;
	@Field(() => String, { nullable: true }) memberImage?: string;
	@Field(() => MemberType) memberType: MemberType;
	@Field(() => String, { nullable: true }) agentCompany?: string;
}

/** the car a conversation or message is about, for the small car card */
@ObjectType()
export class ChatCar {
	@Field(() => String) _id: string;
	@Field(() => String) carTitle: string;
	@Field(() => [String]) carImages: string[];
	@Field(() => Number, { nullable: true }) carPrice?: number;
	@Field(() => Number, { nullable: true }) carPriceUsd?: number;
	@Field(() => CarStatus) carStatus: CarStatus;
}

@ObjectType()
export class PrivateMessage {
	@Field(() => String) _id: string;
	@Field(() => String) conversationId: string;
	@Field(() => String) senderId: string;
	@Field(() => MessageType) messageType: MessageType;
	@Field(() => String, { nullable: true }) messageText?: string;
	/** IMAGE: the photo URL (its thumbnail: the same name with _thumb) */
	@Field(() => String, { nullable: true }) messageImage?: string;
	@Field(() => String, { nullable: true }) carId?: string;
	@Field(() => ChatCar, { nullable: true }) carData?: ChatCar;
	@Field(() => Date) createdAt: Date;
}

/** one conversation as the logged-in member sees it: "partner" is always the other side */
@ObjectType()
export class Conversation {
	@Field(() => String) _id: string;
	@Field(() => String) buyerId: string;
	@Field(() => String) agentId: string;
	@Field(() => ChatPartner, { nullable: true }) partner?: ChatPartner;
	@Field(() => ChatCar, { nullable: true }) carData?: ChatCar;
	@Field(() => String, { nullable: true }) lastMessageText?: string;
	@Field(() => MessageType, { nullable: true }) lastMessageType?: MessageType;
	@Field(() => String, { nullable: true }) lastSenderId?: string;
	@Field(() => Date) lastMessageAt: Date;
	/** messages the logged-in member has not read yet */
	@Field(() => Int) myUnread: number;
	/** read receipts: the other side has seen every message sent before this time */
	@Field(() => Date, { nullable: true }) partnerReadAt?: Date;
}

@ObjectType()
export class Conversations {
	@Field(() => [Conversation]) list: Conversation[];
	@Field(() => Int) total: number;
}
