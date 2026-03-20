import { Redis } from 'ioredis';
import { env } from '../config/env.js';

let redis: Redis | null = null;

if (env.redisUrl) {
  const client = new Redis(env.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1
  });

  client.on('error', (error: Error) => {
    console.warn('[redis] connection error:', error.message);
  });
  redis = client;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!redis) return null;
  try {
    if (redis.status === 'wait') await redis.connect();
    const value = await redis.get(key);
    if (!value) return null;
    return JSON.parse(value) as T;
  } catch (error: any) {
    console.warn('[redis] cacheGet failed:', error.message);
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (!redis) return;
  try {
    if (redis.status === 'wait') await redis.connect();
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (error: any) {
    console.warn('[redis] cacheSet failed:', error.message);
  }
}
