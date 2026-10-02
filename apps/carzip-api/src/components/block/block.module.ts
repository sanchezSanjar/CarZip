import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import BlockSchema from '@app/common/schemas/Block.model';
import MemberSchema from '@app/common/schemas/Member.model';
import { BlockResolver } from './block.resolver';
import { BlockService } from './block.service';
import { AuthModule } from '../auth/auth.module';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Block', schema: BlockSchema },
			{ name: 'Member', schema: MemberSchema }, // target check + memberBlocks counter
		]),
		AuthModule, // guards
	],
	providers: [BlockResolver, BlockService],
	exports: [BlockService], // "did I block this member?" on profiles
})
export class BlockModule {}
