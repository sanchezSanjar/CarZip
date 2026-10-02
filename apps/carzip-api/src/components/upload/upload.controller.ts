import {
	Body,
	Controller,
	ForbiddenException,
	HttpCode,
	Post,
	UploadedFile,
	UploadedFiles,
	UseGuards,
	UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { AuthMemberData } from '../../libs/types/auth';
import { UploadInput } from '../../libs/dto/upload/upload.input';
import { UploadedImage } from '../../libs/dto/upload/upload';
import { UploadTarget } from '@app/common/enums/upload.enum';
import { MemberType } from '@app/common/enums/member.enum';
import { Message } from '@app/common/enums/common.enum';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB per photo, checked while receiving (413 above it)
const MAX_FILES = 20; // CarInput.carImages allows up to 20 photos

/**
 * Image upload over REST multipart (Car Listing flowchart: NOT through GraphQL).
 * The returned URLs are then sent in updateMember(memberImage) / createCar(carImages).
 * Guards run before the file is even read: guests can't make the server parse anything.
 */
@UseGuards(AuthGuard)
@Controller('upload')
export class UploadController {
	constructor(private readonly uploadService: UploadService) {}

	/** POST /upload/image   form-data: file=<image>, target=member|car */
	@Post('image')
	@HttpCode(200)
	@UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE, files: 1 } }))
	public async uploadImage(
		@UploadedFile() file: Express.Multer.File | undefined,
		@Body() input: UploadInput,
		@AuthMember() authMember: AuthMemberData,
	): Promise<UploadedImage> {
		this.checkTarget(input.target, authMember);
		return this.uploadService.uploadImage(file, input.target);
	}

	/** POST /upload/images  form-data: files=<image> (repeat, max 20), target=member|car */
	@Post('images')
	@HttpCode(200)
	@UseInterceptors(FilesInterceptor('files', MAX_FILES, { limits: { fileSize: MAX_FILE_SIZE } }))
	public async uploadImages(
		@UploadedFiles() files: Express.Multer.File[] | undefined,
		@Body() input: UploadInput,
		@AuthMember() authMember: AuthMemberData,
	): Promise<UploadedImage[]> {
		this.checkTarget(input.target, authMember);
		return this.uploadService.uploadImages(files, input.target);
	}

	/** only agents post cars and only agents / admins write articles, so only they upload those images */
	private checkTarget(target: UploadTarget, authMember: AuthMemberData): void {
		const isAgentOrAdmin = authMember.memberType === MemberType.AGENT || authMember.memberType === MemberType.ADMIN;
		if (target === UploadTarget.CAR && !isAgentOrAdmin) throw new ForbiddenException(Message.CAR_IMAGES_AGENT_ONLY);
		if (target === UploadTarget.ARTICLE && !isAgentOrAdmin) {
			throw new ForbiddenException(Message.ARTICLE_IMAGES_NOT_ALLOWED);
		}
	}
}
