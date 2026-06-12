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

function buildCampaignPayload(campaignData: any) {
  if (!campaignData?.name) throw new Error('Nome da campanha e obrigatorio');

  return {
    nome: campaignData.name,
    instituicao: campaignData.institution || '',
    tipo_telefonia: campaignData.type?.toLowerCase() || 'vapi',
    ativa: Boolean(campaignData.active),
    assistant_vapi_id: campaignData.vapi_assistant_id || null,
    linha_vapi_id: campaignData.vapi_phone_id || null,
    max_tentativas: Number(campaignData.maxAttempts || 1),
    intervalo_minutos: Number(campaignData.intervalMinutes || 60),
    janela_inicio: campaignData.startTime || null,
    janela_fim: campaignData.endTime || null,
    descricao: campaignData.description || '',
    ligacoes_simultaneas: Number(campaignData.simultaneousCalls || 1),
    status: campaignData.status || (campaignData.active ? 'active' : 'draft')
  };
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Metodo nao permitido' });

  try {
    const supabase = getSupabaseAdmin();
    const { id, campaign } = readBody(req) as { id?: string; campaign?: any };
    const payload = buildCampaignPayload(campaign);

    if (id) {
      const { data, error } = await supabase
        .from('campaigns')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, campaign: data });
    }

    const { data, error } = await supabase
      .from('campaigns')
      .insert([payload])
      .select('*')
      .single();

    if (error) throw error;
    return res.status(200).json({ success: true, campaign: data });
  } catch (error: any) {
    console.error('[api/campaigns/save] error', error);
    return res.status(500).json({ success: false, error: error.message || 'Erro ao salvar campanha' });
  }
}
