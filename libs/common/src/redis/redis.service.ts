import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Redis, RedisOptions } from 'ioredis';

/**
 * The Redis connections (REDIS_URL, e.g. redis://localhost:6379).
 * Redis makes things faster or shared, it never holds the only copy of data, so the app keeps working without it:
 * no REDIS_URL or Redis down -> no cache, and the live chat keeps its history in the API's memory.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
	private readonly logger = new Logger('RedisService');
	/** cache and chat history */
	public readonly client: Redis | null = null;
	/** pub/sub: a connection that subscribes can't run other commands, so it gets its own */
	public readonly subscriber: Redis | null = null;
	private down = false; // log a lost connection once, not on every retry

	constructor() {
		const url = process.env.REDIS_URL;
		if (!url) {
			this.logger.warn('REDIS_URL is not set: running without Redis (no cache, chat history in memory)');
			return;
		}
		// fail fast while disconnected: callers fall back instead of waiting
		const options: RedisOptions = { maxRetriesPerRequest: 1, enableOfflineQueue: false };
		this.client = this.connect(url, options, 'client');
		this.subscriber = this.connect(url, { ...options, enableOfflineQueue: true }, 'subscriber');
	}

	/** true while commands can be sent */
	public get isReady(): boolean {
		return this.client?.status === 'ready';
	}

	/**
	 * The cached value of `key`, or `load()` it and keep it for `ttlSeconds`.
	 * A Redis problem never breaks the request: the value is then simply loaded from the database.
	 */
	public async getOrSet<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
		if (this.isReady) {
			try {
				const cached = await this.client!.get(key);
				if (cached) return JSON.parse(cached) as T;
			} catch (err) {
				this.logger.warn(`cache read failed (${key}): ${(err as Error).message}`);
			}
		}
		const value = await load();
		if (this.isReady) {
			this.client!.set(key, JSON.stringify(value), 'EX', ttlSeconds).catch((err: Error) =>
				this.logger.warn(`cache write failed (${key}): ${err.message}`),
			);
		}
		return value;
	}

	/** forget cached values, e.g. after the data behind them changed */
	public async invalidate(...keys: string[]): Promise<void> {
		if (!this.isReady || !keys.length) return;
		await this.client!.del(...keys).catch((err: Error) => this.logger.warn(`cache delete failed: ${err.message}`));
	}

	public async onModuleDestroy(): Promise<void> {
		await Promise.all([this.client?.quit().catch(() => null), this.subscriber?.quit().catch(() => null)]);
	}

	private connect(url: string, options: RedisOptions, name: string): Redis {
		const redis = new Redis(url, options);
		redis.on('ready', () => {
			if (name === 'client') this.logger.log(this.down ? 'Redis is back' : 'Redis is connected');
			this.down = false;
		});
		redis.on('error', (err: Error) => {
			if (this.down || name !== 'client') return;
			this.down = true;
			this.logger.warn(`Redis unavailable, retrying in the background: ${err.message}`);
		});
		return redis;
	}
}
