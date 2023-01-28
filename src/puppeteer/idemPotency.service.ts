import { Injectable, Logger } from '@nestjs/common';
import { CheerioPage } from '../util/CheerioPage';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bull';
import * as Redis from 'ioredis';

import * as _ from 'lodash';
import { RedisService } from 'nestjs-redis';

@Injectable()
export class IdemRedisService {
  private readonly logger = new Logger(IdemRedisService.name);

  redis: Redis.Redis;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.redis = this.redisService.getClient(
      this.configService.get('REDIS_NAME'),
    );
  }

  async lockProcess(key: string, value: string): Promise<boolean> {
    const redisValue = await this.redis.get(key);
    if (_.isEmpty(redisValue)) {
      const response = await this.redis.multi().set(key, value).exec();
      console.log(response, 'response');
      const [items] = response;
      if (items.length < 2) {
        return false;
      }
      const [error, result] = items;

      if (_.isEmpty(error) || !_.isEmpty(result)) {
        return true;
      }
      return false;
    }
    return true;
  }

  async unlockProcess(key: string): Promise<void> {
    await this.redis.del(key);
  }
}
