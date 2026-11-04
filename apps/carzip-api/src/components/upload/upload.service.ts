import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { StorageService } from './storage.service';
import { UploadTarget } from '@app/common/enums/upload.enum';
import { UploadedImage } from '../../libs/dto/upload/upload';
import { Message } from '@app/common/enums/common.enum';

const ALLOWED_FORMATS = ['jpeg', 'png', 'webp']; // never svg (can carry scripts) or gif
const MAX_INPUT_PIXELS = 50_000_000; // a tiny file that decodes to a gigantic image (decompression bomb) is refused

/** output sizes per target: car photos are big listing images, member photos are avatars */
const SIZES: Record<UploadTarget, { main: sharp.ResizeOptions; thumb: sharp.ResizeOptions }> = {
	[UploadTarget.CAR]: {
		main: { width: 1600, height: 1200, fit: 'inside', withoutEnlargement: true },
		thumb: { width: 480, height: 360, fit: 'cover' },
	},
	[UploadTarget.ARTICLE]: {
		main: { width: 1600, height: 1200, fit: 'inside', withoutEnlargement: true },
		thumb: { width: 480, height: 360, fit: 'cover' },
	},
	[UploadTarget.MEMBER]: {
		main: { width: 512, height: 512, fit: 'cover' },
		thumb: { width: 128, height: 128, fit: 'cover' },
	},
	// a photo in a message: big enough to see details of a car, the thumbnail fits a chat bubble
	[UploadTarget.CHAT]: {
		main: { width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true },
		thumb: { width: 480, height: 480, fit: 'inside' },
	},
};

/**
 * Voice messages: the phone apps record AAC in an MP4 container (.m4a), the browser build records WebM.
 * There is no audio converter on the server, so the file is stored as it came, after checking that its
 * first bytes really are that format; it is served with a fixed type and nosniff, never run or shown as a page.
 */
const VOICE_FORMATS = [
	{
		ext: 'm4a',
		contentType: 'audio/mp4',
		matches: (b: Buffer) => b.length > 12 && b.toString('latin1', 4, 8) === 'ftyp',
	},
	{ ext: 'webm', contentType: 'audio/webm', matches: (b: Buffer) => b.length > 4 && b.readUInt32BE(0) === 0x1a45dfa3 },
];
export const VOICE_EXTENSIONS = VOICE_FORMATS.map((format) => format.ext);

interface ProcessedImage {
	main: Buffer;
	thumb: Buffer;
}

/**
 * Car Listing flowchart: "Upload via REST · resize + thumbnail → storage → image URLs".
 * Every image is DECODED and RE-ENCODED to WebP, so:
 * - a file that only claims to be an image (fake extension / mimetype) is rejected
 * - what we store is always a clean image we produced, never the uploaded bytes
 * - EXIF metadata is dropped: phone photos carry GPS coordinates (where the dealer lives)
 */
@Injectable()
export class UploadService {
	private readonly logger = new Logger('UploadService');

	constructor(private readonly storage: StorageService) {}

	public async uploadImage(file: Express.Multer.File | undefined, target: UploadTarget): Promise<UploadedImage> {
		if (!file) throw new BadRequestException(Message.NO_FILE);
		const processed = await this.process(file.buffer, target);
		return this.save(processed, target);
	}

	/** all or nothing: every file is checked before anything is saved */
	public async uploadImages(files: Express.Multer.File[] | undefined, target: UploadTarget): Promise<UploadedImage[]> {
		if (!files?.length) throw new BadRequestException(Message.NO_FILE);

		const processed: ProcessedImage[] = [];
		for (const [index, file] of files.entries()) {
			try {
				processed.push(await this.process(file.buffer, target));
			} catch (err: any) {
				throw new BadRequestException(`File ${index + 1} (${file.originalname}): ${err?.message ?? err}`);
			}
		}

		const saved: UploadedImage[] = [];
		for (const image of processed) saved.push(await this.save(image, target));
		return saved;
	}

	/** a voice message for a private conversation (target chat): checked, stored, its URL returned */
	public async uploadVoice(file: Express.Multer.File | undefined): Promise<{ url: string }> {
		if (!file) throw new BadRequestException(Message.NO_FILE);
		const format = VOICE_FORMATS.find((candidate) => candidate.matches(file.buffer));
		if (!format) throw new BadRequestException(Message.INVALID_VOICE);
		const url = await this.storage.save(
			`${UploadTarget.CHAT}/${randomUUID()}.${format.ext}`,
			file.buffer,
			format.contentType,
		);
		return { url };
	}

	/** true only for a voice message URL that our upload API produced */
	public isUploadedVoice(url: string): boolean {
		return this.storage.isOwnUrl(url, UploadTarget.CHAT, VOICE_EXTENSIONS);
	}

	/** true only for a main image URL that our upload API produced for this target */
	public isUploadedImage(url: string, target: UploadTarget): boolean {
		return this.storage.isOwnUrl(url, target);
	}

	/**
	 * Deletes uploaded images (main + thumbnail) for good, e.g. when a car is removed permanently.
	 * Only our own uploads are touched: any other URL is skipped. Returns how many images were removed.
	 */
	public async removeImages(urls: string[], target: UploadTarget): Promise<number> {
		const own = urls.filter((url) => this.storage.isOwnUrl(url, target));
		await Promise.all(
			own.map((url) => {
				const name = url.slice(url.lastIndexOf('/') + 1); // <uuid>.webp, checked by isOwnUrl
				return Promise.all([
					this.storage.delete(`${target}/${name}`),
					this.storage.delete(`${target}/${name.replace('.webp', '_thumb.webp')}`),
				]);
			}),
		);
		return own.length;
	}

	private async process(buffer: Buffer, target: UploadTarget): Promise<ProcessedImage> {
		let format: string | undefined;
		try {
			format = (await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()).format;
		} catch {
			throw new BadRequestException(Message.INVALID_IMAGE);
		}
		if (!format || !ALLOWED_FORMATS.includes(format)) throw new BadRequestException(Message.PROVIDE_ALLOWED_FORMAT);

		try {
			// rotate(): apply the phone's orientation before the EXIF data is dropped
			const image = sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).rotate();
			const [main, thumb] = await Promise.all([
				image.clone().resize(SIZES[target].main).webp({ quality: 82 }).toBuffer(),
				image.clone().resize(SIZES[target].thumb).webp({ quality: 75 }).toBuffer(),
			]);
			return { main, thumb };
		} catch {
			throw new BadRequestException(Message.INVALID_IMAGE); // e.g. a truncated / corrupted file
		}
	}

	private async save(image: ProcessedImage, target: UploadTarget): Promise<UploadedImage> {
		// the server names the file: no client file name or folder ever reaches the disk
		const name = randomUUID();
		const mainKey = `${target}/${name}.webp`;
		const thumbKey = `${target}/${name}_thumb.webp`;
		try {
			const url = await this.storage.save(mainKey, image.main, 'image/webp');
			const thumbnailUrl = await this.storage.save(thumbKey, image.thumb, 'image/webp');
			return { url, thumbnailUrl };
		} catch (err: any) {
			await Promise.all([this.storage.delete(mainKey), this.storage.delete(thumbKey)]);
			this.logger.error(`Saving ${mainKey} failed: ${err?.message ?? err}`);
			throw new InternalServerErrorException(Message.UPLOAD_FAILED);
		}
	}
}
