import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import CommentSchema from '../../schemas/Comment.model';
import CarSchema from '../../schemas/Car.model';
import BoardArticleSchema from '../../schemas/BoardArticle.model';
import MemberSchema from '../../schemas/Member.model';
import BlockSchema from '../../schemas/Block.model';
import { CommentResolver } from './comment.resolver';
import { CommentService } from './comment.service';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
	imports: [
		// the comment targets and their counters are read directly: no circular module imports
		MongooseModule.forFeature([
			{ name: 'Comment', schema: CommentSchema },
			{ name: 'Car', schema: CarSchema },
			{ name: 'BoardArticle', schema: BoardArticleSchema },
			{ name: 'Member', schema: MemberSchema },
			{ name: 'Block', schema: BlockSchema },
		]),
		AuthModule, // guards
		NotificationModule, // COMMENT notification to the owner
	],
	providers: [CommentResolver, CommentService],
	exports: [CommentService],
})
export class CommentModule {}
