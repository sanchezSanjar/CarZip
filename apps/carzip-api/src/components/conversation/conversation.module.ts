import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import ConversationSchema from '@app/common/schemas/Conversation.model';
import PrivateMessageSchema from '@app/common/schemas/PrivateMessage.model';
import MemberSchema from '@app/common/schemas/Member.model';
import BlockSchema from '@app/common/schemas/Block.model';
import TestDriveSchema from '@app/common/schemas/TestDrive.model';
import CarSchema from '@app/common/schemas/Car.model';
import { ConversationService } from './conversation.service';
import { ConversationResolver } from './conversation.resolver';
import { AuthModule } from '../auth/auth.module';
import { SocketModule } from '../../socket/socket.module';
import { UploadModule } from '../upload/upload.module';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Conversation', schema: ConversationSchema },
			{ name: 'PrivateMessage', schema: PrivateMessageSchema },
			{ name: 'Member', schema: MemberSchema }, // partner profiles, ACTIVE check
			{ name: 'Block', schema: BlockSchema }, // a dealer's personal block stops the conversation
			{ name: 'TestDrive', schema: TestDriveSchema }, // a dealer starts only with buyers who asked for a test drive
			{ name: 'Car', schema: CarSchema }, // the car a conversation is about
		]),
		AuthModule,
		SocketModule, // new messages and read receipts go live to the two members
		UploadModule, // "is this photo one of our chat uploads?"
	],
	providers: [ConversationService, ConversationResolver],
})
export class ConversationModule {}
