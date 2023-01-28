import { ConfigFactory } from '@nestjs/config';

interface IRedisConfig {
  redis: {
    host: string;
    port: number;
    db: string;
    password: string;
    keyPrefix: string;
  };
}
export const configuration = () => ({
  redis1: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT),
    db: parseInt(process.env.REDIS_DB),
    password: process.env.REDIS_PASSWORD,
    keyPrefix: process.env.REDIS_PRIFIX,
  },
  redis2: {
    name: process.env.REDIS_NAME,
    url: process.env.REDIS_URI,
    timeout: process.env.REDIS_TIMEOUT,
  },
  redis3: {
    url: process.env.REDIS_URI,
    port: parseInt(process.env.REDIS_PORT),
  },
});
