import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../components/auth/auth.module';
import MemberSchema from '@app/common/schemas/Member.model';
import ChatMessageSchema from '@app/common/schemas/ChatMessage.model';
import { SocketGateway } from './socket.gateway';

@Module({
	imports: [
		AuthModule, // the same login check as the HTTP guards
		MongooseModule.forFeature([
			{ name: 'Member', schema: MemberSchema }, // memberImage for memberData
			{ name: 'ChatMessage', schema: ChatMessageSchema }, // the chat history survives restarts
		]),
	],
	providers: [SocketGateway],
})
export class SocketModule {}
