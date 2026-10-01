import { Injectable } from '@nestjs/common';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { dirname, join, resolve, sep } from 'path';

/**
 * Where image files live. The rest of the app only knows this interface, so moving from the local disk
 * to object storage (S3 / Cloudflare R2 / NCP Object Storage) means writing one new class and changing
 * the provider in UploadModule.
 */
export abstract class StorageService {
	/** saves the file under key (e.g. "car/<uuid>.webp") and returns its public URL */
	public abstract save(key: string, data: Buffer, contentType: string): Promise<string>;
	public abstract delete(key: string): Promise<void>;
}

/** local disk: ./uploads, served by main.ts at /uploads */
@Injectable()
export class LocalStorageService extends StorageService {
	public static readonly ROOT = resolve(process.cwd(), 'uploads');

	public async save(key: string, data: Buffer): Promise<string> {
		const path = this.pathOf(key);
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, data);
		return `${this.publicBaseUrl()}/uploads/${key}`;
	}

	public async delete(key: string): Promise<void> {
		await unlink(this.pathOf(key)).catch(() => undefined);
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
