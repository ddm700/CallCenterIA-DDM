import { createClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY nao configurados');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function getN8nWebhookUrl(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { data } = await supabase
    .from('app_settings')
    .select('setting_key, setting_value')
    .in('setting_key', ['n8n_webhook_url', 'n8n_webhook_vapi', 'webhook_url']);

  return (
    data?.find((item: any) => item.setting_key === 'n8n_webhook_vapi')?.setting_value ||
    data?.find((item: any) => item.setting_key === 'n8n_webhook_url')?.setting_value ||
    data?.find((item: any) => item.setting_key === 'webhook_url')?.setting_value ||
    'https://n8n-n8n-start.xzz0ed.easypanel.host/webhook/callcenteria'
  );
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Metodo nao permitido' });

  try {
    const supabase = getSupabaseAdmin();
    const { contactId, campaignId, customerNumber, customerName } = req.body as {
      contactId?: string;
      campaignId?: string;
      customerNumber?: string;
      customerName?: string;
    };

    if (!customerNumber || !customerName) {
      return res.status(400).json({ success: false, error: 'Telefone e nome sao obrigatorios' });
    }

    let cpf = '';
    if (contactId) {
      const { data } = await supabase.from('contacts').select('cpf').eq('id', contactId).maybeSingle();
      cpf = data?.cpf || '';
    }

    const n8nWebhookUrl = await getN8nWebhookUrl(supabase);

    let assistantId: string | null = null;
    let phoneNumberId: string | null = null;

    if (campaignId) {
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('assistant_vapi_id, linha_vapi_id')
        .eq('id', campaignId)
        .maybeSingle();

      if (campaign) {
        assistantId = campaign.assistant_vapi_id;
        phoneNumberId = campaign.linha_vapi_id ? String(campaign.linha_vapi_id).split(',')[0] : null;
      }
    }

    let campaignContactId: string | null = null;
    if (campaignId && contactId) {
      const { data: cc } = await supabase
        .from('campaign_contacts')
        .select('id')
        .eq('campaign_id', campaignId)
        .eq('contact_id', contactId)
        .in('status', ['pendente', 'em_andamento'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      campaignContactId = cc?.id || null;
      if (cc?.id) {
        await supabase
          .from('campaign_contacts')
          .update({ status: 'em_andamento', ultima_tentativa: new Date().toISOString() })
          .eq('id', cc.id);
      }
    }

    const backendPublicUrl =
      process.env.BACKEND_PUBLIC_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
    const callbackUrl = `${backendPublicUrl}/api/webhooks/vapi/callback`;

    const { data: callRecord } = await supabase
      .from('calls')
      .insert({
        campaign_contact_id: campaignContactId,
        contact_phone_id: null,
        customer_number: customerNumber,
        campanha: campaignId ? null : 'Direta',
        cpf,
        cliente: customerName,
        assistant_id: assistantId,
        phone_number_id: phoneNumberId,
        status: 'queued'
      })
      .select('id')
      .maybeSingle();

    const n8nPayload = {
      contactId: contactId || null,
      campaignContactId,
      campaignId: campaignId || 'manual',
      customerNumber,
      customerName,
      cpf,
      assistantId,
      phoneNumberId,
      callbackUrl,
      tipoTelefonia: 'vapi'
    };

    const response = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-source': 'node-backend',
        'x-function-name': 'initiate-vapi-call',
        'x-system': 'discador-vapi',
        'x-version': '1.0'
      },
      body: JSON.stringify(n8nPayload)
    });

    if (!response.ok) throw new Error(`Erro n8n: ${response.status} ${response.statusText}`);

    return res.json({ success: true, message: 'Ligacao iniciada', callId: callRecord?.id ?? null });
  } catch (error: any) {
    console.error('[calls/initiate] error', error);
    return res.status(500).json({ success: false, error: error.message || 'Erro interno' });
  }
}
