import { Router } from 'express';
import { cacheGet, cacheSet } from '../lib/cache.js';
import { supabaseAdmin } from '../lib/supabase.js';

export const vapiRouter = Router();

async function getVapiApiKey(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('app_settings')
    .select('setting_value')
    .eq('setting_key', 'vapi_api_key')
    .limit(1)
    .maybeSingle();
  return data?.setting_value || process.env.VAPI_API_KEY || null;
}

vapiRouter.get('/resources', async (_req, res) => {
  try {
    const cacheKey = 'vapi:resources';
    const cached = await cacheGet<{ assistants: any[]; phoneNumbers: any[] }>(cacheKey);
    if (cached) {
      return res.json({ success: true, assistants: cached.assistants, phoneNumbers: cached.phoneNumbers, cached: true });
    }

    const apiKey = await getVapiApiKey();
    if (!apiKey) return res.status(400).json({ success: false, error: 'VAPI API key nao configurada' });

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

    const assistantsJson: any = assistantsRes.ok ? await assistantsRes.json() : [];
    const phonesJson: any = phonesRes.ok ? await phonesRes.json() : [];

    const assistants = Array.isArray(assistantsJson) ? assistantsJson : assistantsJson.results || [];
    const phoneNumbers = Array.isArray(phonesJson) ? phonesJson : phonesJson.results || [];

    await cacheSet(cacheKey, { assistants, phoneNumbers }, 120);
    return res.json({ success: true, assistants, phoneNumbers, cached: false });
  } catch (error: any) {
    console.error('[vapi/resources] error', error);
    return res.status(500).json({ success: false, error: error.message || 'Erro interno' });
  }
});
