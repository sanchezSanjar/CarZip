import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import BlockSchema from '@app/common/schemas/Block.model';
import MemberSchema from '@app/common/schemas/Member.model';
import FollowSchema from '@app/common/schemas/Follow.model';
import { BlockResolver } from './block.resolver';
import { BlockService } from './block.service';
import { AuthModule } from '../auth/auth.module';
import { TestDriveModule } from '../test-drive/test-drive.module';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Block', schema: BlockSchema },
			{ name: 'Member', schema: MemberSchema }, // target check + memberBlocks counter
			{ name: 'Follow', schema: FollowSchema }, // a block also ends the blocked member's follow
		]),
		AuthModule, // guards
		TestDriveModule, // a block cancels the blocked member's open test drives with this agent
	],
	providers: [BlockResolver, BlockService],
	exports: [BlockService], // "did I block this member?" on profiles
})
export class BlockModule {}
