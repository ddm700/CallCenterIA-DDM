import { Queue } from 'bullmq';
import { createRedis } from './redis';

export const QUEUE_NAME = 'contact-webhook';

export function createQueue() {
  const connection = createRedis();
  return new Queue(QUEUE_NAME, { connection });
}
