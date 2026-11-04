import { IsIn } from 'class-validator';
import { UploadTarget } from '@app/common/enums/upload.enum';

/** multipart form field next to the file(s): target=member | car | article | chat */
export class UploadInput {
	@IsIn(Object.values(UploadTarget), { message: 'target must be member, car, article or chat' })
	target: UploadTarget;
}
