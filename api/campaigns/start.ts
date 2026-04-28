import { createClient } from '@supabase/supabase-js';
import { format, toZonedTime } from 'date-fns-tz';

const CONCURRENT_BATCH_SIZE = 10;
const DELAY_BETWEEN_BATCHES_MS = 1000;

type ProcessResult = { contactId: string; contactName: string; success: boolean; error?: string };

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados');
  return createClient(url, key, { auth: { persistSession: false } });
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Método não permitido' });

  try {
    const supabase = getSupabaseAdmin();
    const { campaignId } = req.body as { campaignId?: string };
    if (!campaignId) return res.status(400).json({ success: false, error: 'campaignId obrigatorio' });

    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns').select('*').eq('id', campaignId).single();
    if (campaignError || !campaign) throw new Error('Campanha não encontrada');
    if (!campaign.ativa) throw new Error('Campanha não está ativa');

    if (!campaign.ignore_horario && campaign.janela_inicio && campaign.janela_fim) {
      const brasiliaTime = toZonedTime(new Date(), 'America/Sao_Paulo');
      const currentHour = format(brasiliaTime, 'HH:mm', { timeZone: 'America/Sao_Paulo' });
      if (currentHour < campaign.janela_inicio || currentHour > campaign.janela_fim) {
        throw new Error(`Fora do horário (${campaign.janela_inicio} - ${campaign.janela_fim})`);
      }
    }

    let vapiLines: string[] = [];
    if (campaign.tipo_telefonia === 'vapi') {
      if (!campaign.assistant_vapi_id || !campaign.linha_vapi_id)
        throw new Error('Campanha sem configuração VAPI completa');
      vapiLines = shuffleArray(String(campaign.linha_vapi_id).split(',').filter(Boolean));
      if (vapiLines.length === 0) throw new Error('Nenhuma linha VAPI configurada');
    }

    const { data: campaignContacts, error: contactsError } = await supabase
      .from('campaign_contacts')
      .select(`id, tentativas_realizadas, ultima_tentativa, status, contact_id,
        contacts ( id, nome, cpf, instituicao, telefone )`)
      .eq('campaign_id', campaignId)
      .in('status', ['pendente', 'em_andamento']);

    if (contactsError) throw new Error(`Erro ao buscar contatos: ${contactsError.message}`);
    if (!campaignContacts || campaignContacts.length === 0)
      return res.json({ success: true, message: 'Nenhum contato pendente', totalProcessed: 0, successful: 0, failed: 0 });

    const now = new Date();
    const eligibleContacts = campaignContacts.filter((cc: any) => {
      if ((cc.tentativas_realizadas || 0) >= campaign.max_tentativas) return false;
      if (cc.ultima_tentativa) {
        const minutes = (now.getTime() - new Date(cc.ultima_tentativa).getTime()) / (1000 * 60);
        if (minutes < campaign.intervalo_minutos) return false;
      }
      return true;
    });

    if (eligibleContacts.length === 0)
      return res.json({ success: true, message: 'Nenhum contato elegível', totalProcessed: 0, successful: 0, failed: 0 });

    const { data: n8nSetting } = await supabase
      .from('app_settings').select('setting_value')
      .eq('setting_key', 'n8n_webhook_url').limit(1).maybeSingle();

    const n8nWebhookUrl =
      n8nSetting?.setting_value || 'https://n8n-n8n-start.xzz0ed.easypanel.host/webhook/callcenteria';

    const backendPublicUrl =
      process.env.BACKEND_PUBLIC_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
    const callbackUrl = `${backendPublicUrl}/api/webhooks/vapi/callback`;

    const processContact = async (cc: any, lineIndex: number): Promise<ProcessResult> => {
      const contact = Array.isArray(cc.contacts) ? cc.contacts[0] : cc.contacts;
      const phoneNumber = contact?.telefone;

      if (!phoneNumber || !contact) {
        return { contactId: contact?.id || cc.contact_id, contactName: contact?.nome || 'Desconhecido', success: false, error: 'Sem telefone' };
      }

      try {
        const linhaVapiId = campaign.tipo_telefonia === 'vapi' ? vapiLines[lineIndex % vapiLines.length] : null;
        const n8nPayload = {
          contactId: contact.id, campaignContactId: cc.id,
          phoneId: null, campaignId: campaign.id,
          customerNumber: phoneNumber, customerName: contact.nome, customerCpf: contact.cpf,
          assistantId: campaign.assistant_vapi_id,
          phoneNumberId: linhaVapiId || String(campaign.linha_vapi_id || '').split(',')[0],
          callbackUrl, tipoTelefonia: campaign.tipo_telefonia
        };

        const response = await fetch(n8nWebhookUrl, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(n8nPayload)
        });
        if (!response.ok) throw new Error(`Erro n8n: ${response.status} ${response.statusText}`);

        await supabase.from('campaign_contacts').update({
          status: 'em_andamento',
          tentativas_realizadas: (cc.tentativas_realizadas || 0) + 1,
          ultima_tentativa: new Date().toISOString()
        }).eq('id', cc.id);

        return { contactId: contact.id, contactName: contact.nome, success: true };
      } catch (error: any) {
        return { contactId: contact.id, contactName: contact.nome, success: false, error: error.message };
      }
    };

    const allResults: ProcessResult[] = [];
    for (let i = 0; i < eligibleContacts.length; i += CONCURRENT_BATCH_SIZE) {
      const batch = eligibleContacts.slice(i, i + CONCURRENT_BATCH_SIZE);
      const batchResult = await Promise.all(batch.map((c: any, idx: number) => processContact(c, i + idx)));
      allResults.push(...batchResult);
      if (i + CONCURRENT_BATCH_SIZE < eligibleContacts.length) {
        await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
      }
    }

    const successful = allResults.filter((r) => r.success).length;
    const failed = allResults.filter((r) => !r.success).length;

    return res.json({
      success: true,
      message: `Processamento concluído: ${successful} iniciadas, ${failed} falhas`,
      totalProcessed: allResults.length, successful, failed, results: allResults
    });
  } catch (error: any) {
    console.error('[campaigns/start] error', error);
    return res.status(500).json({ success: false, error: error.message || 'Erro ao iniciar campanha' });
  }
}
