import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, utimes, writeFile, readdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { UploadBatchService } from './upload.batch';

const USED = '11111111-1111-4111-8111-111111111111';
const GONE = '22222222-2222-4222-8222-222222222222';
const TWO_DAYS_AGO = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

const distinct = (values: string[]) => ({ distinct: () => ({ exec: async () => values }) });

describe('UploadBatchService: photos of private messages', () => {
	let root: string;

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'carzip-uploads-'));
		await mkdir(join(root, 'chat'));
		for (const uuid of [USED, GONE]) {
			for (const name of [`${uuid}.webp`, `${uuid}_thumb.webp`]) {
				await writeFile(join(root, 'chat', name), 'x');
				await utimes(join(root, 'chat', name), TWO_DAYS_AGO, TWO_DAYS_AGO);
			}
		}
	});
	afterEach(() => rm(root, { recursive: true, force: true }));

	it('keeps a photo a message still shows, and deletes one whose message is gone (after 14 days)', async () => {
		const service = new UploadBatchService(
			distinct([]) as never,
			distinct([]) as never,
			distinct([]) as never,
			distinct([`https://api.carzip.kr/uploads/chat/${USED}.webp`]) as never,
		);
		expect(await service.removeUnused(root)).toBe(1);
		expect((await readdir(join(root, 'chat'))).sort()).toEqual([`${USED}.webp`, `${USED}_thumb.webp`]);
	});

	it('a voice message file whose message is gone is deleted too, one still used stays', async () => {
		for (const uuid of [USED, GONE]) {
			await writeFile(join(root, 'chat', `${uuid}.m4a`), 'x');
			await utimes(join(root, 'chat', `${uuid}.m4a`), TWO_DAYS_AGO, TWO_DAYS_AGO);
		}
		const service = new UploadBatchService(
			distinct([]) as never,
			distinct([]) as never,
			distinct([]) as never,
			distinct([
				`https://api.carzip.kr/uploads/chat/${USED}.webp`,
				`https://api.carzip.kr/uploads/chat/${USED}.m4a`,
			]) as never,
		);
		await service.removeUnused(root);
		expect((await readdir(join(root, 'chat'))).sort()).toEqual([`${USED}.m4a`, `${USED}.webp`, `${USED}_thumb.webp`]);
	});
});
