import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../components/auth/auth.module';
import MemberSchema from '../schemas/Member.model';
import { SocketGateway } from './socket.gateway';

@Module({
	imports: [
		AuthModule, // the same login check as the HTTP guards
		MongooseModule.forFeature([{ name: 'Member', schema: MemberSchema }]), // memberImage for memberData
	],
	providers: [SocketGateway],
})
export class SocketModule {}
