import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RedisService } from './redis.service';

/** a fake Redis client: a Map instead of a server */
const fakeClient = (store: Map<string, string>, status = 'ready') => ({
	status,
	get: vi.fn(async (key: string) => store.get(key) ?? null),
	set: vi.fn(async (key: string, value: string) => void store.set(key, value)),
	del: vi.fn(async (...keys: string[]) => keys.forEach((key) => store.delete(key))),
});

/** a RedisService with the fake client (or none, like without REDIS_URL) */
const serviceWith = (client: ReturnType<typeof fakeClient> | null) => {
	delete process.env.REDIS_URL;
	const service = new RedisService();
	Object.assign(service, { client });
	return service;
};

describe('RedisService.getOrSet: cache first, the database only when needed', () => {
	let store: Map<string, string>;
	let load: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		store = new Map();
		load = vi.fn(async () => ({ total: 25 }));
	});

	it('loads once, then answers from the cache', async () => {
		const service = serviceWith(fakeClient(store));
		expect(await service.getOrSet('stats', 60, load)).toEqual({ total: 25 });
		expect(await service.getOrSet('stats', 60, load)).toEqual({ total: 25 });
		expect(load).toHaveBeenCalledTimes(1);
	});

	it('keeps the value only for the given seconds', async () => {
		const client = fakeClient(store);
		await serviceWith(client).getOrSet('stats', 60, load);
		expect(client.set).toHaveBeenCalledWith('stats', JSON.stringify({ total: 25 }), 'EX', 60);
	});

	it('loads again after invalidate', async () => {
		const service = serviceWith(fakeClient(store));
		await service.getOrSet('stats', 60, load);
		await service.invalidate('stats');
		await service.getOrSet('stats', 60, load);
		expect(load).toHaveBeenCalledTimes(2);
	});

	it('still answers without Redis (no REDIS_URL)', async () => {
		expect(await serviceWith(null).getOrSet('stats', 60, load)).toEqual({ total: 25 });
	});

	it('still answers while Redis is down, without touching it', async () => {
		const client = fakeClient(store, 'reconnecting');
		expect(await serviceWith(client).getOrSet('stats', 60, load)).toEqual({ total: 25 });
		expect(client.get).not.toHaveBeenCalled();
	});

	it('still answers when a cache read fails', async () => {
		const client = fakeClient(store);
		client.get.mockRejectedValueOnce(new Error('timeout'));
		expect(await serviceWith(client).getOrSet('stats', 60, load)).toEqual({ total: 25 });
	});
});
