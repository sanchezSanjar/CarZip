import { Field, InputType, Int } from '@nestjs/graphql';
import { IsDate, IsInt, IsMongoId, IsOptional, IsUrl, Length, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** open (or create) the conversation with a member, optionally about one of the dealer's cars */
@InputType()
export class StartConversationInput {
	@IsMongoId()
	@Field(() => String)
	targetId: string;

	@IsOptional()
	@IsMongoId()
	@Field(() => String, { nullable: true })
	carId?: string;
}

@InputType()
export class SendMessageInput {
	@IsMongoId()
	@Field(() => String)
	conversationId: string;

	/** the text, or a caption for the photo. A message needs a text or a photo */
	@IsOptional()
	@Length(0, 1000)
	@Field(() => String, { nullable: true })
	messageText?: string;

	/** a photo uploaded with POST /upload/image, target chat */
	@IsOptional()
	@IsUrl({ require_tld: false })
	@Field(() => String, { nullable: true })
	messageImage?: string;

	/** "about this car": the car becomes the conversation's car and shows as a card in the message */
	@IsOptional()
	@IsMongoId()
	@Field(() => String, { nullable: true })
	carId?: string;
}

/** a page of a thread, newest first. The next (older) page: before = createdAt of the oldest message shown */
@InputType()
export class MessagesInquiry {
	@IsMongoId()
	@Field(() => String)
	conversationId: string;

	@IsOptional()
	@Type(() => Date)
	@IsDate()
	@Field(() => Date, { nullable: true })
	before?: Date;

	@IsInt()
	@Min(1)
	@Max(50)
	@Field(() => Int)
	limit: number;
}

@InputType()
export class ConversationsInquiry {
	@IsInt()
	@Min(1)
	@Field(() => Int)
	page: number;

	@IsInt()
	@Min(1)
	@Max(50)
	@Field(() => Int)
	limit: number;
}
