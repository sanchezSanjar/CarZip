import {
	BadRequestException,
	Injectable,
	InternalServerErrorException,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BoardArticle, BoardArticles } from '../../libs/dto/board-article/board-article';
import { BoardArticleInput, BoardArticlesInquiry } from '../../libs/dto/board-article/board-article.input';
import { BoardArticleUpdate } from '../../libs/dto/board-article/board-article.update';
import { AgentPublic } from '../../libs/dto/car/car';
import { Member } from '../../libs/dto/member/member';
import { BoardArticleStatus } from '../../libs/enums/board-article.enum';
import { Direction, Message } from '../../libs/enums/common.enum';
import { MemberType } from '../../libs/enums/member.enum';
import { UploadTarget } from '../../libs/enums/upload.enum';
import { ViewGroup } from '../../libs/enums/view.enum';
import { AuthMemberData } from '../../libs/types/auth';
import { escapeRegex, shapeIntoMongoObjectId } from '../../libs/config';
import { lookupPublicMember, PUBLIC_MEMBER_FIELDS } from '../../libs/utils/lookup';
import { ViewService } from '../view/view.service';
import { UploadService } from '../upload/upload.service';

/**
 * Community board. Who does what (the user's rule, beyond the flowchart):
 * - AGENT and ADMIN write articles, USER only reads
 * - AGENT edits / deletes only their OWN articles, ADMIN any article
 */
@Injectable()
export class BoardArticleService {
	private readonly logger = new Logger('BoardArticleService');

	constructor(
		@InjectModel('BoardArticle') private readonly boardArticleModel: Model<BoardArticle>,
		@InjectModel('Member') private readonly memberModel: Model<Member>, // memberArticles counter, author data
		private readonly viewService: ViewService,
		private readonly uploadService: UploadService,
	) {}

	public async createBoardArticle(memberId: Types.ObjectId, input: BoardArticleInput): Promise<BoardArticle> {
		this.assertOwnImage(input.articleImage);

		let created: BoardArticle;
		try {
			created = (await this.boardArticleModel.create({ ...input, memberId })).toObject();
		} catch (err: any) {
			this.logger.error(`createBoardArticle failed: ${err?.message ?? err}`);
			throw new InternalServerErrorException(Message.CREATE_FAILED);
		}
		await this.memberModel.updateOne({ _id: memberId }, { $inc: { memberArticles: 1 } });
		return created;
	}

	/**
	 * One article. ACTIVE: everyone. DELETE: admins only ("not found" for everyone else).
	 * Views: logged-in viewers, once per article, never the author's own.
	 */
	public async getBoardArticle(articleId: Types.ObjectId, viewer: AuthMemberData | null): Promise<BoardArticle> {
		const article = await this.boardArticleModel.findById(articleId).lean<BoardArticle>().exec();
		const isAdmin = viewer?.memberType === MemberType.ADMIN;
		if (!article || (article.articleStatus !== BoardArticleStatus.ACTIVE && !isAdmin)) {
			throw new NotFoundException(Message.NO_DATA_FOUND);
		}

		const isAuthor = !!viewer && String(article.memberId) === String(viewer._id);
		if (viewer && !isAuthor && article.articleStatus === BoardArticleStatus.ACTIVE) {
			const isNewView = await this.viewService.recordView({
				memberId: viewer._id,
				viewRefId: articleId,
				viewGroup: ViewGroup.ARTICLE,
			});
			if (isNewView) {
				await this.boardArticleModel.updateOne({ _id: articleId }, { $inc: { articleViews: 1 } }).exec();
				article.articleViews += 1;
			}
		}

		// the author, PUBLIC fields only. A plain read: no profile view is counted for the author
		const author = await this.memberModel
			.findById(article.memberId)
			.select(PUBLIC_MEMBER_FIELDS.join(' '))
			.lean<AgentPublic>()
			.exec();
		return { ...article, memberData: author ?? undefined };
	}

	/** AGENT: own ACTIVE articles. ADMIN: any ACTIVE article. DELETE lowers the AUTHOR's memberArticles. */
	public async updateBoardArticle(editor: AuthMemberData, input: BoardArticleUpdate): Promise<BoardArticle> {
		const articleId = shapeIntoMongoObjectId(input._id);
		const isAdmin = editor.memberType === MemberType.ADMIN;
		const article = await this.boardArticleModel.findById(articleId).lean<BoardArticle>().exec();
		const canEdit = !!article && (isAdmin || String(article.memberId) === String(editor._id));
		// someone else's article = "not found": never reveal or touch it
		if (!article || !canEdit || article.articleStatus !== BoardArticleStatus.ACTIVE) {
			throw new NotFoundException(Message.NO_DATA_FOUND);
		}

		const $set: Record<string, unknown> = {};
		for (const key of ['articleTitle', 'articleContent', 'articleImage'] as const) {
			if (input[key] !== undefined && input[key] !== null) $set[key] = input[key];
		}
		if (input.articleStatus === BoardArticleStatus.DELETE) $set.articleStatus = BoardArticleStatus.DELETE;
		if (!Object.keys($set).length) throw new BadRequestException(Message.NOTHING_TO_UPDATE);
		this.assertOwnImage(input.articleImage);

		// only while still ACTIVE: two parallel deletes can't both lower the counter
		const updated = await this.boardArticleModel
			.findOneAndUpdate({ _id: articleId, articleStatus: BoardArticleStatus.ACTIVE }, { $set }, { new: true })
			.lean<BoardArticle>()
			.exec();
		if (!updated) throw new BadRequestException(Message.UPDATE_FAILED);

		if ($set.articleStatus === BoardArticleStatus.DELETE) {
			// the author's counter, also when an admin deletes someone else's article
			await this.memberModel.updateOne({ _id: article.memberId }, { $inc: { memberArticles: -1 } });
		}
		return updated;
	}

	/** the public board: ACTIVE articles, newest first by default, with each author's public data */
	public async getBoardArticles(input: BoardArticlesInquiry): Promise<BoardArticles> {
		const { articleCategory, text, memberId } = input.search ?? {};
		const match: Record<string, unknown> = { articleStatus: BoardArticleStatus.ACTIVE };
		if (articleCategory) match.articleCategory = articleCategory;
		if (memberId) match.memberId = shapeIntoMongoObjectId(memberId);
		if (text?.trim()) match.articleTitle = new RegExp(escapeRegex(text.trim()), 'i');
		const direction = input.direction ?? Direction.DESC;
		// _id breaks ties (same likes / views): an article never shows up on two pages or on none
		const sort: Record<string, Direction> = { [input.sort ?? 'createdAt']: direction, _id: direction };

		const [result] = await this.boardArticleModel
			.aggregate<BoardArticles>([
				{ $match: match },
				{ $sort: sort },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							...lookupPublicMember('memberData'),
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();
		return result ?? { list: [], metaCounter: [] };
	}

	/** the article image must come from our upload API (POST /upload/image, target=article) */
	private assertOwnImage(url?: string | null): void {
		if (url && !this.uploadService.isUploadedImage(url, UploadTarget.ARTICLE)) {
			throw new BadRequestException(Message.ARTICLE_IMAGE_NOT_UPLOADED);
		}
	}
}
