import { cacheGet, cacheSet } from '../lib/cache.js';
import { hasSupabaseAdminConfig, supabaseAdmin } from '../lib/supabase.js';

export type VapiResources = {
  assistants: any[];
  phoneNumbers: any[];
  cached: boolean;
};

async function getVapiApiKey(): Promise<string | null> {
  const envApiKey = process.env.VAPI_API_KEY || process.env.VITE_VAPI_API_KEY;
  if (envApiKey) return envApiKey;

  if (!hasSupabaseAdminConfig()) return null;

  try {
    const { data, error } = await supabaseAdmin
      .from('app_settings')
      .select('setting_value')
      .eq('setting_key', 'vapi_api_key')
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[vapi/resources] app_settings error', error);
      return null;
    }

    return data?.setting_value || null;
  } catch (error) {
    console.error('[vapi/resources] app_settings unavailable', error);
    return null;
  }
}

export async function fetchVapiResources(): Promise<VapiResources> {
  const cacheKey = 'vapi:resources';
  const cached = await cacheGet<{ assistants: any[]; phoneNumbers: any[] }>(cacheKey);
  if (cached) {
    return { assistants: cached.assistants, phoneNumbers: cached.phoneNumbers, cached: true };
  }

  const apiKey = await getVapiApiKey();
  if (!apiKey) {
    throw Object.assign(new Error('VAPI API key nao configurada'), { statusCode: 400 });
  }

  const [assistantsRes, phonesRes] = await Promise.all([
    fetch('https://api.vapi.ai/assistant', {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    }),
    fetch('https://api.vapi.ai/phone-number', {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    })
  ]);

  if (!assistantsRes.ok || !phonesRes.ok) {
    throw Object.assign(
      new Error(`Erro ao buscar recursos VAPI (assistants=${assistantsRes.status}, phoneNumbers=${phonesRes.status})`),
      { statusCode: 502 }
    );
  }

  const assistantsJson: any = await assistantsRes.json();
  const phonesJson: any = await phonesRes.json();

  const assistants = Array.isArray(assistantsJson) ? assistantsJson : assistantsJson.results || [];
  const phoneNumbers = Array.isArray(phonesJson) ? phonesJson : phonesJson.results || [];

  await cacheSet(cacheKey, { assistants, phoneNumbers }, 120);
  return { assistants, phoneNumbers, cached: false };
}
