import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS } from './redis.constants';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis(config.get<string>('REDIS_URL', 'redis://127.0.0.1:6379'), {
          maxRetriesPerRequest: 3,
          lazyConnect: true,
        }),
    },
    RedisService,
  ],
  exports: [REDIS, RedisService],
})
export class RedisModule {}
