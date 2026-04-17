import { Redis } from 'ioredis';
import { config } from './config';

export function createRedis() {
  return new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    tls: config.redis.tls ? {} : undefined,
    maxRetriesPerRequest: null
  });
}
