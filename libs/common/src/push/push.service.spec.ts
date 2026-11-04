import { describe, it, expect, vi, afterEach } from 'vitest';
import { Types } from 'mongoose';
import { PushService } from './push.service';

const query = (value: unknown) => {
	const chain: Record<string, unknown> = { exec: async () => value };
	for (const step of ['select', 'lean']) chain[step] = () => chain;
	return chain;
};

const buyerId = new Types.ObjectId();
const tokens = ['ExponentPushToken[phone-1]', 'ExponentPushToken[phone-2]'];

function setup(expoAnswer: unknown = { data: [{ status: 'ok' }, { status: 'ok' }] }, ok = true) {
	const model = {
		find: vi.fn(() => query(tokens.map((token) => ({ token })))),
		deleteMany: vi.fn(() => query({ deletedCount: 1 })),
		updateOne: vi.fn(() => query({})),
		deleteOne: vi.fn(() => query({})),
	};
	const fetchMock = vi.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => expoAnswer }));
	vi.stubGlobal('fetch', fetchMock);
	return { service: new PushService(model as never), model, fetchMock };
}

afterEach(() => vi.unstubAllGlobals());

describe('PushService', () => {
	it("sends one push to each of the member's phones through Expo", async () => {
		const { service, fetchMock } = setup();
		await service.sendToMembers([buyerId], { title: 'dealer', body: 'Yes, 5% off', data: { type: 'message' } });
		expect(fetchMock).toHaveBeenCalledWith('https://exp.host/--/api/v2/push/send', expect.anything());
		const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
		expect(sent.map((m: { to: string }) => m.to)).toEqual(tokens);
		expect(sent[0]).toMatchObject({ title: 'dealer', body: 'Yes, 5% off', data: { type: 'message' } });
	});

	it('a phone Expo reports as gone (app deleted) is forgotten', async () => {
		const { service, model } = setup({
			data: [{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }],
		});
		await service.sendToMembers([buyerId], { title: 'x' });
		expect(model.deleteMany).toHaveBeenCalledWith({ token: { $in: ['ExponentPushToken[phone-2]'] } });
	});

	it('never throws: a message must not fail because Expo is down', async () => {
		const { service } = setup({}, false);
		await expect(service.sendToMembers([buyerId], { title: 'x' })).resolves.toBeUndefined();
	});

	it('logging out a session removes its phone; "keep" spares the device that changed the password', async () => {
		const { service, model } = setup();
		await service.removeSessions(['session-a']);
		expect(model.deleteMany).toHaveBeenCalledWith({ sessionId: { $in: ['session-a'] } });
		await service.removeMember(buyerId, 'session-b');
		expect(model.deleteMany).toHaveBeenCalledWith({ memberId: buyerId, sessionId: { $ne: 'session-b' } });
	});
});
