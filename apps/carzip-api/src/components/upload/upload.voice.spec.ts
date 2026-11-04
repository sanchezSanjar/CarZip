import { describe, it, expect, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { UploadService } from './upload.service';
import { Message } from '@app/common/enums/common.enum';

const file = (bytes: Buffer) => ({ buffer: bytes }) as Express.Multer.File;
// the first bytes of real recordings: MP4/M4A has "ftyp" at byte 4, WebM starts with the EBML id 1A 45 DF A3
const m4a = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypM4A '), Buffer.alloc(32)]);
const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(32)]);

function setup() {
	const storage = { save: vi.fn(async (key: string) => `http://localhost:3007/uploads/${key}`), isOwnUrl: vi.fn() };
	return { service: new UploadService(storage as never), storage };
}

describe('UploadService.uploadVoice', () => {
	it('stores an m4a recording (phones) and a webm recording (browser) under chat with their own type', async () => {
		const { service, storage } = setup();
		expect((await service.uploadVoice(file(m4a))).url).toMatch(/\/uploads\/chat\/[0-9a-f-]{36}\.m4a$/);
		expect(storage.save).toHaveBeenLastCalledWith(expect.stringMatching(/^chat\/.+\.m4a$/), m4a, 'audio/mp4');
		expect((await service.uploadVoice(file(webm))).url).toMatch(/\.webm$/);
	});

	it('refuses anything that is not one of those recordings, whatever the file is called', async () => {
		const { service, storage } = setup();
		const html = Buffer.from('<html><script>alert(1)</script></html>');
		await expect(service.uploadVoice(file(html))).rejects.toThrow(new BadRequestException(Message.INVALID_VOICE));
		await expect(service.uploadVoice(undefined)).rejects.toThrow(Message.NO_FILE);
		expect(storage.save).not.toHaveBeenCalled();
	});
});
