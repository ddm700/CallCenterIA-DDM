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

export const env = {
  port: Number(process.env.PORT || 4000),
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
  backendPublicUrl: process.env.BACKEND_PUBLIC_URL || `http://localhost:${process.env.PORT || 4000}`,
  supabaseUrl: required('SUPABASE_URL'),
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  redisUrl: process.env.REDIS_URL || ''
};
