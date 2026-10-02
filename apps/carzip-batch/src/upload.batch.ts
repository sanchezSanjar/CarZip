import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { readdir, stat, unlink } from 'fs/promises';
import { join } from 'path';
import { Model } from 'mongoose';
import { UPLOADS_ROOT } from '@app/common/config/uploads';
import { UploadTarget } from '@app/common/enums/upload.enum';

const GRACE = 24 * 60 * 60 * 1000; // an upload has a day to be attached to a car / profile / article
// only files the API produced: <uuid>.webp and its <uuid>_thumb.webp. Anything else in the folder is never touched.
const MAIN_FILE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.webp$/;
const THUMB_FILE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_thumb\.webp$/;
// the uuid of an uploaded image inside any stored URL, whatever host the URL was built with
const URL_UUID =
	/\/uploads\/(?:member|car|article)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.webp/;

/**
 * Uploaded images nobody uses: a dealer uploads photos and never saves the car, a member changes their
 * profile photo, a car is edited to drop photos. After a day they are deleted (main + thumbnail).
 * Works on the local disk the API writes to (UPLOADS_ROOT); with object storage this job
 * would list the bucket instead.
 */
@Injectable()
export class UploadBatchService {
	private readonly logger = new Logger('UploadBatchService');

	constructor(
		@InjectModel('Car') private readonly carModel: Model<{ carImages: string[] }>,
		@InjectModel('Member') private readonly memberModel: Model<{ memberImage?: string; agentBusinessCard?: string }>,
		@InjectModel('BoardArticle') private readonly boardArticleModel: Model<{ articleImage?: string }>,
	) {}

	/** returns how many images (main + thumbnail pairs, or lone thumbnails) were deleted */
	public async removeUnused(root = UPLOADS_ROOT): Promise<number> {
		// 1. old enough files on disk FIRST, then what the DB uses: an image attached in between is still seen as used
		const candidates: { dir: string; uuid: string; files: string[] }[] = [];
		for (const target of Object.values(UploadTarget)) {
			const dir = join(root, target);
			const names = await readdir(dir).catch(() => [] as string[]); // folder not created yet
			const byUuid = new Map<string, string[]>();
			for (const name of names) {
				const uuid = (MAIN_FILE.exec(name) ?? THUMB_FILE.exec(name))?.[1];
				if (uuid) byUuid.set(uuid, [...(byUuid.get(uuid) ?? []), name]);
			}
			for (const [uuid, files] of byUuid) {
				const times = await Promise.all(files.map((file) => stat(join(dir, file)).then((s) => s.mtimeMs)));
				if (Date.now() - Math.max(...times) > GRACE) candidates.push({ dir, uuid, files });
			}
		}
		if (!candidates.length) return 0;

		// 2. every image the DB still points to, in ANY status (a deleted car can be restored, its photos must stay)
		const used = await this.usedUuids();

		// 3. delete the rest
		let removed = 0;
		for (const { dir, uuid, files } of candidates) {
			if (used.has(uuid)) continue;
			await Promise.all(files.map((file) => unlink(join(dir, file)).catch(() => undefined)));
			removed++;
		}
		if (removed) this.logger.log(`removed ${removed} unused image(s)`);
		return removed;
	}

	private async usedUuids(): Promise<Set<string>> {
		const [carImages, memberImages, businessCards, articleImages] = await Promise.all([
			this.carModel.distinct('carImages').exec(),
			this.memberModel.distinct('memberImage').exec(),
			this.memberModel.distinct('agentBusinessCard').exec(),
			this.boardArticleModel.distinct('articleImage').exec(),
		]);
		const used = new Set<string>();
		for (const url of [...carImages, ...memberImages, ...businessCards, ...articleImages]) {
			const uuid = typeof url === 'string' ? URL_UUID.exec(url)?.[1] : undefined;
			if (uuid) used.add(uuid);
		}
		return used;
	}
}
