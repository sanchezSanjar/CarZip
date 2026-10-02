import { Injectable } from '@nestjs/common';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { dirname, join, resolve, sep } from 'path';
import { UPLOADS_ROOT } from '@app/common/config/uploads';

/**
 * Where image files live. The rest of the app only knows this interface, so moving from the local disk
 * to object storage (S3 / Cloudflare R2 / NCP Object Storage) means writing one new class and changing
 * the provider in UploadModule.
 */
export abstract class StorageService {
	/** saves the file under key (e.g. "car/<uuid>.webp") and returns its public URL */
	public abstract save(key: string, data: Buffer, contentType: string): Promise<string>;
	public abstract delete(key: string): Promise<void>;
	/** true if url is a file this storage serves under folder (e.g. "car") */
	public abstract isOwnUrl(url: string, folder: string): boolean;
}

// what UploadService names a main image: <uuid>.webp (thumbnails "<uuid>_thumb.webp" are for lists, not listings)
const UPLOADED_FILE_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;

/** local disk: ./uploads, served by main.ts at /uploads */
@Injectable()
export class LocalStorageService extends StorageService {
	public static readonly ROOT = UPLOADS_ROOT;

	public async save(key: string, data: Buffer): Promise<string> {
		const path = this.pathOf(key);
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, data);
		return `${this.publicBaseUrl()}/uploads/${key}`;
	}

	public async delete(key: string): Promise<void> {
		await unlink(this.pathOf(key)).catch(() => undefined);
	}

	public isOwnUrl(url: string, folder: string): boolean {
		const prefix = `${this.publicBaseUrl()}/uploads/${folder}/`;
		return url.startsWith(prefix) && UPLOADED_FILE_NAME.test(url.slice(prefix.length));
	}

	/** keys are built by the server, but never trust a path: it must stay inside ./uploads */
	private pathOf(key: string): string {
		const path = resolve(join(LocalStorageService.ROOT, key));
		if (!path.startsWith(LocalStorageService.ROOT + sep)) throw new Error(`Invalid storage key: ${key}`);
		return path;
	}

	/** absolute URLs, so carImages pass @IsUrl and the frontend can use them as-is */
	private publicBaseUrl(): string {
		return process.env.UPLOADS_PUBLIC_URL ?? `http://localhost:${process.env.PORT_API ?? 3000}`;
	}
}
