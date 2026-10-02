import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import BoardArticleSchema from '@app/common/schemas/BoardArticle.model';
import MemberSchema from '@app/common/schemas/Member.model';
import BlockSchema from '@app/common/schemas/Block.model';
import { BoardArticleResolver } from './board-article.resolver';
import { BoardArticleService } from './board-article.service';
import { AuthModule } from '../auth/auth.module';
import { ViewModule } from '../view/view.module';
import { UploadModule } from '../upload/upload.module';
import { LikeModule } from '../like/like.module';
import { NotificationModule } from '../notification/notification.module';
import { CommentModule } from '../comment/comment.module';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'BoardArticle', schema: BoardArticleSchema },
			{ name: 'Member', schema: MemberSchema }, // memberArticles counter, author data
			{ name: 'Block', schema: BlockSchema }, // personal blocks stop likes
		]),
		AuthModule, // guards
		ViewModule, // articleViews
		UploadModule, // "is this image one of our uploads?"
		LikeModule, // articleLikes
		NotificationModule, // LIKE notification to the author
		CommentModule, // an article removed for good takes its comments with it
	],
	providers: [BoardArticleResolver, BoardArticleService],
	exports: [BoardArticleService],
})
export class BoardArticleModule {}
