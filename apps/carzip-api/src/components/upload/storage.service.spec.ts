import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { LocalStorageService } from './storage.service';

describe('LocalStorageService.isOwnUrl: only images our upload API produced', () => {
	const storage = new LocalStorageService();
	const uuid = '3f2b6c1e-8a4d-4f0b-9c2e-1d5a7b9e0c11';
	const saved = process.env.UPLOADS_PUBLIC_URL;

	beforeAll(() => {
		process.env.UPLOADS_PUBLIC_URL = 'https://api.carzip.kr';
	});
	afterAll(() => {
		process.env.UPLOADS_PUBLIC_URL = saved;
	});

	it('accepts our own upload in the right folder', () => {
		expect(storage.isOwnUrl(`https://api.carzip.kr/uploads/member/${uuid}.webp`, 'member')).toBe(true);
	});

	it.each([
		['another website', `https://example.com/uploads/member/${uuid}.webp`],
		['another folder', `https://api.carzip.kr/uploads/car/${uuid}.webp`],
		['a thumbnail', `https://api.carzip.kr/uploads/member/${uuid}_thumb.webp`],
		['a name we never make', 'https://api.carzip.kr/uploads/member/photo.jpg'],
		['a path trick', `https://api.carzip.kr/uploads/member/../car/${uuid}.webp`],
	])('refuses %s', (_, url) => {
		expect(storage.isOwnUrl(url, 'member')).toBe(false);
	});
});
