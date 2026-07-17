import type { ConsumeMessage } from 'amqplib';
import { env } from '../config/env.js';
import { getDispatchErrorMessage, getN8nWebhookUrl, postWebhookWithRetries } from '../services/callDispatch.js';
import { assertQueue, getChannel } from './rabbitmq.js';
import type { CallDispatchPayload } from './types.js';

async function handleCallDispatch(payload: CallDispatchPayload) {
  const n8nWebhookUrl = await getN8nWebhookUrl();
  return postWebhookWithRetries(n8nWebhookUrl, payload as unknown as Record<string, unknown>);
}

function parseMessage(message: ConsumeMessage): CallDispatchPayload | null {
  try {
    return JSON.parse(message.content.toString()) as CallDispatchPayload;
  } catch (error) {
    console.error('[queues/call-dispatch] invalid payload', error);
    return null;
  }
}

async function startWorker() {
  const channel = await assertQueue(env.rabbitmqCallDispatchQueue);
  await channel.prefetch(env.rabbitmqPrefetch);

  await channel.consume(env.rabbitmqCallDispatchQueue, async (message) => {
    if (!message) return;

    const payload = parseMessage(message);
    if (!payload) {
      channel.ack(message);
      return;
    }

    try {
      const result = await handleCallDispatch(payload);

      if (!result.ok) {
        console.error(
          `[queues/call-dispatch] dispatch failed contact=${payload.contactId ?? 'manual'} ` +
            `campaign=${payload.campaignId} status=${result.statusCode ?? 'sem-status'} error=${getDispatchErrorMessage(result)}`
        );
      }

      channel.ack(message);
    } catch (error: any) {
      console.error('[queues/call-dispatch] unexpected job failure', error?.message || error);
      channel.nack(message, false, true);
    }
  });

  console.log(
    `[queues/call-dispatch] consuming queue ${env.rabbitmqCallDispatchQueue} with prefetch=${env.rabbitmqPrefetch}`
  );
}

startWorker().catch(async (error) => {
  console.error('[queues/call-dispatch] startup failed', error);

  try {
    const channel = await getChannel();
    await channel.close();
  } catch {
    // noop
  }

  process.exit(1);
});
