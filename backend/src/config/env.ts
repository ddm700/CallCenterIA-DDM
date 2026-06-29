import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const candidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'backend/.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../../../.env')
];

for (const envFile of candidates) {
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile, override: false });
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function nonNegativeInt(name: string, fallback: number): number {
  const rawValue = process.env[name];
  if (!rawValue) return fallback;

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Variavel ${name} invalida. Esperado inteiro nao negativo.`);
  }

  return parsed;
}

export const env = {
  port: Number(process.env.PORT || 4000),
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
  backendPublicUrl: process.env.BACKEND_PUBLIC_URL || `http://localhost:${process.env.PORT || 4000}`,
  supabaseUrl: required('SUPABASE_URL'),
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  redisUrl: process.env.REDIS_URL || '',
  rabbitmqUrl: process.env.RABBITMQ_URL || '',
  rabbitmqCallDispatchQueue: process.env.RABBITMQ_CALL_DISPATCH_QUEUE || 'call.dispatch',
  rabbitmqPrefetch: Math.max(1, nonNegativeInt('RABBITMQ_PREFETCH', 6)),
  campaignStartMaxConcurrency: Math.max(1, nonNegativeInt('CAMPAIGN_START_MAX_CONCURRENCY', 1)),
  campaignStartBatchSize: Math.max(1, nonNegativeInt('CAMPAIGN_START_BATCH_SIZE', 25)),
  campaignStartPauseMs: nonNegativeInt('CAMPAIGN_START_PAUSE_MS', 90000),
  campaignStartRequestIntervalMs: nonNegativeInt('CAMPAIGN_START_REQUEST_INTERVAL_MS', 5000),
  campaignStartMaxRetries: nonNegativeInt('CAMPAIGN_START_MAX_RETRIES', 5),
  campaignStartRetryBaseMs: nonNegativeInt('CAMPAIGN_START_RETRY_BASE_MS', 2000),
  campaignStartRetryMaxMs: nonNegativeInt('CAMPAIGN_START_RETRY_MAX_MS', 30000)
};
