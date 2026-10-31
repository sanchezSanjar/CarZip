import { describe, it, expect } from 'vitest';
import { SocketGateway } from './socket.gateway';

const DAY = 24 * 60 * 60 * 1000;

/** one chat message as stored in Redis, written `daysAgo` days ago */
const message = (daysAgo: number, text: string) => ({
	event: 'message',
	text,
	memberData: { _id: 'm1', memberNick: 'cz_buyer', memberType: 'USER' },
	createdAt: new Date(Date.now() - daysAgo * DAY).toISOString(),
});

/** the gateway with a fake Redis: a list (newest first, like LPUSH) and the expiry set on it */
function setup(stored: ReturnType<typeof message>[]) {
	const redis = { list: stored.map((m) => JSON.stringify(m)), expiry: 0 };
	const client = {
		status: 'ready',
		lrange: async (_key: string, start: number, stop: number) => redis.list.slice(start, stop + 1),
		ltrim: async (_key: string, start: number, stop: number) => void (redis.list = redis.list.slice(start, stop + 1)),
		del: async () => void (redis.list = []),
		multi() {
			const steps: (() => void)[] = [];
			const chain = {
				lpush: (_key: string, data: string) => (steps.push(() => redis.list.unshift(data)), chain),
				ltrim: (_key: string, start: number, stop: number) => (
					steps.push(() => (redis.list = redis.list.slice(start, stop + 1))),
					chain
				),
				pexpire: (_key: string, ms: number) => (steps.push(() => (redis.expiry = ms)), chain),
				publish: () => chain,
				exec: async () => steps.forEach((step) => step()),
			};
			return chain;
		},
	};
	const redisService = { isReady: true, client, subscriber: { status: 'ready' } };
	// private methods are called directly: they hold the rule being tested
	const gateway = new SocketGateway({} as never, {} as never, redisService as never) as any;
	gateway.emitData = () => undefined;
	return { gateway, redis, redisService };
}

describe('SocketGateway: chat history keeps 7 days', () => {
	it('shows only the messages of the last 7 days and deletes the older ones from Redis', async () => {
		const { gateway, redis } = setup([message(1, 'new'), message(3, 'mid'), message(8, 'old'), message(22, 'oldest')]);
		const shown = await gateway.recentMessages();
		expect(shown.map((m: { text: string }) => m.text)).toEqual(['mid', 'new']); // oldest first
		expect(redis.list).toHaveLength(2);
	});

	it('deletes the whole history when every message is older than 7 days', async () => {
		const { gateway, redis } = setup([message(9, 'a'), message(22, 'b')]);
		expect(await gateway.recentMessages()).toEqual([]);
		expect(redis.list).toEqual([]);
	});

	it('gives the history a 7-day expiry with each new message', async () => {
		const { gateway, redis } = setup([]);
		await gateway.publish(message(0, 'hello'));
		expect(redis.expiry).toBe(7 * DAY);
		expect(await gateway.recentMessages()).toHaveLength(1);
	});

	it('drops old messages from memory too while Redis is down', async () => {
		const { gateway, redisService } = setup([]);
		redisService.isReady = false;
		gateway.messageList.push(message(10, 'old'), message(0, 'new'));
		const shown = await gateway.recentMessages();
		expect(shown.map((m: { text: string }) => m.text)).toEqual(['new']);
	});
});
