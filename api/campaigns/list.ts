import { createClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados');
  return createClient(url, key, { auth: { persistSession: false } });
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Método não permitido' });

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('campaigns')
      .select('id, nome, ativa, status, created_at')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    return res.status(200).json({ success: true, campaigns: data || [] });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message || 'Erro interno' });
  }
}
