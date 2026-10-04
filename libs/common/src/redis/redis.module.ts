import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

/** one set of Redis connections for the whole app (cache, live chat) */
@Global()
@Module({
	providers: [RedisService],
	exports: [RedisService],
})
export class RedisModule {}
