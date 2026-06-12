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
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const campaigns = await Promise.all((data || []).map(async (campaign: any) => {
      const [{ count: total }, { count: pending }, { count: completed }] = await Promise.all([
        supabase
          .from('campaign_contacts')
          .select('*', { count: 'exact', head: true })
          .eq('campaign_id', campaign.id),
        supabase
          .from('campaign_contacts')
          .select('*', { count: 'exact', head: true })
          .eq('campaign_id', campaign.id)
          .eq('status', 'pendente'),
        supabase
          .from('campaign_contacts')
          .select('*', { count: 'exact', head: true })
          .eq('campaign_id', campaign.id)
          .in('status', ['concluido', 'completed'])
      ]);

      return {
        id: campaign.id,
        name: campaign.nome,
        institution: campaign.instituicao || '',
        type: campaign.tipo_telefonia === 'whatsapp' ? 'WhatsApp' : 'VAPI',
        status: campaign.status || (campaign.ativa ? 'active' : 'paused'),
        totalContacts: total || 0,
        pendingContacts: pending || 0,
        completedContacts: completed || 0,
        successRate: total ? Math.round(((completed || 0) / total) * 100) : 0,
        active: campaign.ativa,
        vapi_assistant_id: campaign.assistant_vapi_id,
        vapi_phone_id: campaign.linha_vapi_id,
        maxAttempts: campaign.max_tentativas,
        intervalMinutes: campaign.intervalo_minutos,
        startTime: campaign.janela_inicio ? campaign.janela_inicio.slice(0, 5) : '',
        endTime: campaign.janela_fim ? campaign.janela_fim.slice(0, 5) : '',
        created_at: campaign.created_at,
        description: campaign.descricao,
        simultaneousCalls: campaign.ligacoes_simultaneas
      };
    }));

    return res.status(200).json({ success: true, campaigns });
  } catch (error: any) {
    console.error('[api/campaigns/list] error', error);
    return res.status(500).json({ success: false, error: error.message || 'Erro interno' });
  }
}
