import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

type SupabaseAdminClient = SupabaseClient<any, 'public', any>;

export const hasSupabaseAdminConfig = (): boolean => Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);

export const assertSupabaseAdminConfig = () => {
  if (hasSupabaseAdminConfig()) return;

  const missing = [
    env.supabaseUrl ? null : 'SUPABASE_URL',
    env.supabaseServiceRoleKey ? null : 'SUPABASE_SERVICE_ROLE_KEY'
  ].filter(Boolean);

  throw new Error(`Missing required env vars: ${missing.join(', ')}`);
};

let supabaseAdminClient: SupabaseAdminClient | null = null;

export const getSupabaseAdmin = (): SupabaseAdminClient => {
  assertSupabaseAdminConfig();

  if (!supabaseAdminClient) {
    supabaseAdminClient = createClient<any, 'public', any>(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { persistSession: false }
    });
  }

  return supabaseAdminClient;
};

export const supabaseAdmin = new Proxy({} as SupabaseAdminClient, {
  get(_target, prop) {
    const client = getSupabaseAdmin();
    const value = Reflect.get(client, prop);
    return typeof value === 'function' ? value.bind(client) : value;
  }
});
