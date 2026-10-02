import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import FollowSchema from '@app/common/schemas/Follow.model';
import MemberSchema from '@app/common/schemas/Member.model';
import BlockSchema from '@app/common/schemas/Block.model';
import { FollowResolver } from './follow.resolver';
import { FollowService } from './follow.service';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
	imports: [
		// read directly: no circular module imports
		MongooseModule.forFeature([
			{ name: 'Follow', schema: FollowSchema },
			{ name: 'Member', schema: MemberSchema }, // target check + follower / following counters
			{ name: 'Block', schema: BlockSchema }, // personal blocks stop follows
		]),
		AuthModule, // guards
		NotificationModule, // "new follower" notification
	],
	providers: [FollowResolver, FollowService],
	exports: [FollowService],
})
export class FollowModule {}
