import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import BoardArticleSchema from '../../schemas/BoardArticle.model';
import MemberSchema from '../../schemas/Member.model';
import { BoardArticleResolver } from './board-article.resolver';
import { BoardArticleService } from './board-article.service';
import { AuthModule } from '../auth/auth.module';
import { ViewModule } from '../view/view.module';
import { UploadModule } from '../upload/upload.module';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'BoardArticle', schema: BoardArticleSchema },
			{ name: 'Member', schema: MemberSchema }, // memberArticles counter, author data
		]),
		AuthModule, // guards
		ViewModule, // articleViews
		UploadModule, // "is this image one of our uploads?"
	],
	providers: [BoardArticleResolver, BoardArticleService],
	exports: [BoardArticleService],
})
export class BoardArticleModule {}
