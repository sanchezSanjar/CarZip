import { describe, it, expect, vi } from 'vitest';
import { RedisService } from './redis.service';

/** a fake ioredis client: INCR / EXPIRE NX / SET NX on a Map, with the real call shapes */
function fakeClient(status = 'ready') {
	const values = new Map<string, string>();
	const ttls = new Map<string, number>();
	const client = {
		status,
		values,
		ttls,
		multi() {
			const ops: (() => unknown)[] = [];
			const chain = {
				incr: (key: string) => {
					ops.push(() => {
						const next = Number(values.get(key) ?? 0) + 1;
						values.set(key, String(next));
						return next;
					});
					return chain;
				},
				expire: (key: string, seconds: number, mode?: string) => {
					ops.push(() => {
						if (mode === 'NX' && ttls.has(key)) return 0;
						ttls.set(key, seconds);
						return 1;
					});
					return chain;
				},
				exec: async () => ops.map((op) => [null, op()] as [null, unknown]),
			};
			return chain;
		},
		set: vi.fn(async (key: string, value: string, _ex: string, seconds: number, mode?: string) => {
			if (mode === 'NX' && values.has(key)) return null;
			values.set(key, value);
			ttls.set(key, seconds);
			return 'OK';
		}),
	};
	return client;
}

const serviceWith = (client: ReturnType<typeof fakeClient> | null) => {
	delete process.env.REDIS_URL;
	const service = new RedisService();
	Object.assign(service, { client });
	return service;
};

describe('RedisService.countHit: an atomic counter with an expiry', () => {
	it('counts 1, 2, 3 ... for the same key', async () => {
		const service = serviceWith(fakeClient());
		expect(await service.countHit('otp:ip:1.1.1.1', 3600)).toBe(1);
		expect(await service.countHit('otp:ip:1.1.1.1', 3600)).toBe(2);
		expect(await service.countHit('otp:ip:2.2.2.2', 3600)).toBe(1);
	});

	it('the expiry is set once, from the first hit, and later hits do not extend it', async () => {
		const client = fakeClient();
		const service = serviceWith(client);
		await service.countHit('k', 3600);
		client.ttls.set('k', 10); // pretend 3590 seconds have passed
		await service.countHit('k', 3600);
		expect(client.ttls.get('k')).toBe(10); // EXPIRE ... NX left it alone
	});

	it('answers null while Redis is not ready, or not configured', async () => {
		expect(await serviceWith(fakeClient('connecting')).countHit('k', 60)).toBeNull();
		expect(await serviceWith(null).countHit('k', 60)).toBeNull();
	});
});

describe('RedisService.claim: SET NX for a cooldown', () => {
	it('the first claim wins, the second within the time does not', async () => {
		const client = fakeClient();
		const service = serviceWith(client);
		expect(await service.claim('cooldown:x', 60)).toBe(true);
		expect(await service.claim('cooldown:x', 60)).toBe(false);
		expect(client.set).toHaveBeenCalledWith('cooldown:x', '1', 'EX', 60, 'NX');
	});

	it('answers null while Redis is not ready', async () => {
		expect(await serviceWith(fakeClient('end')).claim('k', 60)).toBeNull();
	});
});
