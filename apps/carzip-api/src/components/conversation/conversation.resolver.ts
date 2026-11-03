import { UseGuards } from '@nestjs/common';
import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { ConversationService } from './conversation.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { AuthMemberData } from '../../libs/types/auth';
import { Conversation, Conversations, PrivateMessage } from '../../libs/dto/conversation/conversation';
import {
	ConversationsInquiry,
	MessagesInquiry,
	SendMessageInput,
	StartConversationInput,
} from '../../libs/dto/conversation/conversation.input';
import { shapeIntoMongoObjectId } from '../../libs/config';

/** private messages between a buyer and a dealer (API.md §17). Everything needs a logged-in member */
@Resolver()
@UseGuards(AuthGuard)
export class ConversationResolver {
	constructor(private readonly conversationService: ConversationService) {}

	// opens the existing conversation with this member, or creates it (the rules are in the service)
	@Mutation(() => Conversation)
	public async startConversation(
		@Args('input') input: StartConversationInput,
		@AuthMember() me: AuthMemberData,
	): Promise<Conversation> {
		return this.conversationService.startConversation(me, input);
	}

	@Query(() => Conversations)
	public async getConversations(
		@Args('input') input: ConversationsInquiry,
		@AuthMember() me: AuthMemberData,
	): Promise<Conversations> {
		return this.conversationService.getConversations(me, input);
	}

	@Query(() => [PrivateMessage])
	public async getMessages(
		@Args('input') input: MessagesInquiry,
		@AuthMember() me: AuthMemberData,
	): Promise<PrivateMessage[]> {
		return this.conversationService.getMessages(me, input);
	}

	@Mutation(() => PrivateMessage)
	public async sendMessage(
		@Args('input') input: SendMessageInput,
		@AuthMember() me: AuthMemberData,
	): Promise<PrivateMessage> {
		return this.conversationService.sendMessage(me, input);
	}

	@Mutation(() => Boolean)
	public async markConversationRead(
		@Args('conversationId') conversationId: string,
		@AuthMember() me: AuthMemberData,
	): Promise<boolean> {
		return this.conversationService.markConversationRead(me, String(shapeIntoMongoObjectId(conversationId)));
	}

	@Query(() => Int)
	public async getUnreadMessageCount(@AuthMember() me: AuthMemberData): Promise<number> {
		return this.conversationService.getUnreadMessageCount(me);
	}
}
