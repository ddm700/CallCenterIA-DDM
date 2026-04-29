import { createClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY nao configurados');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function getVapiApiKey() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('app_settings')
    .select('setting_value')
    .eq('setting_key', 'vapi_api_key')
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return data?.setting_value || process.env.VAPI_API_KEY || null;
}

async function fetchVapiCollection(path: string, apiKey: string) {
  const response = await fetch(`https://api.vapi.ai${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });

  const payload = await response.json().catch(() => ([]));
  if (!response.ok) {
    const message =
      typeof payload?.message === 'string'
        ? payload.message
        : typeof payload?.error === 'string'
          ? payload.error
          : `Erro HTTP ${response.status} ao consultar VAPI`;
    throw new Error(message);
  }

  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload?.results) ? payload.results : [];
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Metodo nao permitido' });

  try {
    const apiKey = await getVapiApiKey();
    if (!apiKey) {
      return res.status(400).json({ success: false, error: 'VAPI API key nao configurada' });
    }

    const [assistants, phoneNumbers] = await Promise.all([
      fetchVapiCollection('/assistant', apiKey),
      fetchVapiCollection('/phone-number', apiKey)
    ]);

    return res.status(200).json({
      success: true,
      assistants,
      phoneNumbers
    });
  } catch (error: any) {
    console.error('[api/vapi/resources] error', error);
    return res.status(500).json({ success: false, error: error?.message || 'Erro interno' });
  }
}
