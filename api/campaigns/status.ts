import { createClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY nao configurados');
  return createClient(url, key, { auth: { persistSession: false } });
}

function readBody(req: any) {
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  return req.body || {};
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Metodo nao permitido' });

  try {
    const { id, isActive } = readBody(req) as { id?: string; isActive?: boolean };
    if (!id) return res.status(400).json({ success: false, error: 'id obrigatorio' });

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('campaigns')
      .update({
        ativa: Boolean(isActive),
        status: isActive ? 'active' : 'paused'
      })
      .eq('id', id);

    if (error) throw error;
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('[api/campaigns/status] error', error);
    return res.status(500).json({ success: false, error: error.message || 'Erro ao atualizar status' });
  }
}
