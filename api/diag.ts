import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  const result: Record<string, any> = {
    timestamp: new Date().toISOString(),
    env: {
      SUPABASE_URL: supabaseUrl ? `${supabaseUrl.slice(0, 35)}...` : 'NAO DEFINIDA',
      SUPABASE_SERVICE_ROLE_KEY: serviceKey ? 'DEFINIDA' : 'NAO DEFINIDA',
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ? 'DEFINIDA' : 'NAO DEFINIDA',
      FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN || 'NAO DEFINIDA',
    },
    db: { ok: false, error: null as string | null },
    campaigns: [] as any[],
  };

  if (supabaseUrl && serviceKey) {
    try {
      const client = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

      const { count, error } = await client
        .from('campaigns')
        .select('*', { count: 'exact', head: true });

      if (error) {
        result.db = { ok: false, error: error.message };
      } else {
        result.db = { ok: true, campaigns_count: count };

        const { data: camps } = await client
          .from('campaigns')
          .select('id, nome, ativa, status')
          .order('created_at', { ascending: false })
          .limit(10);

        result.campaigns = (camps || []).map((c: any) => ({
          id: c.id,
          nome: c.nome,
          ativa: c.ativa,
          status: c.status,
        }));
      }
    } catch (e: any) {
      result.db = { ok: false, error: e.message };
    }
  } else {
    result.db = { ok: false, error: 'Credenciais do Supabase não configuradas' };
  }

  res.status(200).json(result);
}
