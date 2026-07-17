import amqplib, { type Channel, type ChannelModel } from 'amqplib';
import { env } from '../config/env.js';

let connectionPromise: Promise<ChannelModel> | null = null;
let channelPromise: Promise<Channel> | null = null;

async function createConnection(): Promise<ChannelModel> {
  if (!env.rabbitmqUrl) {
    throw new Error('RABBITMQ_URL nao configurada');
  }

  const connection = await amqplib.connect(env.rabbitmqUrl);

  connection.on('error', (error) => {
    console.error('[rabbitmq] connection error', error.message);
    connectionPromise = null;
    channelPromise = null;
  });

  connection.on('close', () => {
    console.warn('[rabbitmq] connection closed');
    connectionPromise = null;
    channelPromise = null;
  });

  return connection;
}

async function getConnection(): Promise<ChannelModel> {
  connectionPromise ??= createConnection();
  return connectionPromise;
}

async function createChannel(): Promise<Channel> {
  const connection = await getConnection();
  const channel = await connection.createChannel();

  channel.on('error', (error) => {
    console.error('[rabbitmq] channel error', error.message);
    channelPromise = null;
  });

  channel.on('close', () => {
    console.warn('[rabbitmq] channel closed');
    channelPromise = null;
  });

  return channel;
}

export async function getChannel(): Promise<Channel> {
  channelPromise ??= createChannel();
  return channelPromise;
}

export async function assertQueue(queueName: string): Promise<Channel> {
  const channel = await getChannel();
  await channel.assertQueue(queueName, { durable: true });
  return channel;
}

export async function publishJson(queueName: string, payload: unknown): Promise<void> {
  const channel = await assertQueue(queueName);
  const published = channel.sendToQueue(queueName, Buffer.from(JSON.stringify(payload)), {
    persistent: true,
    contentType: 'application/json'
  });

  if (!published) {
    await new Promise<void>((resolve) => channel.once('drain', () => resolve()));
  }
}
