import { env } from '../config/env.js';
import { supabaseAdmin } from './supabase.js';

const BACKEND_PUBLIC_URL_SETTING_KEYS = [
  'backend_public_url',
  'backend_url',
  'public_base_url',
  'public_url'
] as const;

interface QueuedCallInput {
  campaignContactId?: string | null;
  contactPhoneId?: string | null;
  customerNumber?: string | null;
  campaignName?: string | null;
  customerCpf?: string | null;
  customerName?: string | null;
  assistantId?: string | null;
  phoneNumberId?: string | null;
}

function normalizeBaseUrl(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function isLoopbackUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname === '::1';
  } catch {
    return false;
  }
}

function getVercelPublicUrl(): string | null {
  const rawUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (!rawUrl) return null;

  const withProtocol = rawUrl.startsWith('http://') || rawUrl.startsWith('https://') ? rawUrl : `https://${rawUrl}`;
  return normalizeBaseUrl(withProtocol);
}

export async function getBackendPublicUrl(): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('app_settings')
    .select('setting_key, setting_value')
    .in('setting_key', [...BACKEND_PUBLIC_URL_SETTING_KEYS]);

  if (!error && data) {
    for (const key of BACKEND_PUBLIC_URL_SETTING_KEYS) {
      const configuredUrl = normalizeBaseUrl(data.find((item: any) => item.setting_key === key)?.setting_value);
      if (configuredUrl) {
        return configuredUrl;
      }
    }
  }

  const configuredFallbackUrl = normalizeBaseUrl(env.backendPublicUrl);
  const fallbackUrl =
    configuredFallbackUrl && !isLoopbackUrl(configuredFallbackUrl)
      ? configuredFallbackUrl
      : getVercelPublicUrl() || configuredFallbackUrl || `http://localhost:${env.port}`;

  if (isLoopbackUrl(fallbackUrl)) {
    console.warn(
      `[calls] BACKEND_PUBLIC_URL em modo loopback (${fallbackUrl}). ` +
        'Callbacks externos da VAPI/n8n nao vao conseguir atingir esse endereco. ' +
        'Configure app_settings.backend_public_url ou a env BACKEND_PUBLIC_URL com uma URL publica.'
    );
  }

  return fallbackUrl;
}

export async function createQueuedCallRecord(input: QueuedCallInput): Promise<string | null> {
  const payload = {
    campaign_contact_id: input.campaignContactId ?? null,
    contact_phone_id: input.contactPhoneId ?? null,
    customer_number: input.customerNumber ?? null,
    campanha: input.campaignName ?? null,
    cpf: input.customerCpf ?? null,
    cliente: input.customerName ?? null,
    assistant_id: input.assistantId ?? null,
    phone_number_id: input.phoneNumberId ?? null,
    status: 'queued'
  };

  const { data, error } = await supabaseAdmin.from('calls').insert(payload).select('id').maybeSingle();
  if (error) {
    console.warn('[calls] nao foi possivel criar registro queued em calls:', error.message);
    return null;
  }

  return data?.id ?? null;
}
