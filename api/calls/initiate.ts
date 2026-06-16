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

async function getVapiApiKey(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { data, error } = await supabase
    .from('app_settings')
    .select('setting_value')
    .eq('setting_key', 'vapi_api_key')
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.setting_value || process.env.VAPI_API_KEY || null;
}

async function getBackendPublicUrl(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const keys = ['backend_public_url', 'backend_url', 'public_base_url', 'public_url'];
  const { data } = await supabase
    .from('app_settings')
    .select('setting_key, setting_value')
    .in('setting_key', keys);

  for (const key of keys) {
    const raw = data?.find((item: any) => item.setting_key === key)?.setting_value;
    const value = typeof raw === 'string' ? raw.trim().replace(/\/+$/, '') : '';
    if (!value) continue;
    try {
      new URL(value);
      return value;
    } catch {}
  }

  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || '';
  if (vercelUrl) {
    return (vercelUrl.startsWith('http') ? vercelUrl : `https://${vercelUrl}`).replace(/\/+$/, '');
  }

  return (process.env.BACKEND_PUBLIC_URL || '').replace(/\/+$/, '');
}

async function parseResponseBody(response: Response) {
  const raw = await response.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function createVapiCall(apiKey: string, payload: Record<string, unknown>) {
  const response = await fetch('https://api.vapi.ai/call', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const body = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(
      typeof body === 'string'
        ? body
        : JSON.stringify(body || { status: response.status, statusText: response.statusText })
    );
  }

  return { status: response.status, body };
}

function getVapiCustomerName(name: string) {
  const cleaned = name.trim();
  return cleaned.length > 40 ? cleaned.slice(0, 40) : cleaned;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Metodo nao permitido' });

  try {
    const supabase = getSupabaseAdmin();
    const {
      contactId,
      campaignId,
      campaignContactId: incomingCampaignContactId,
      customerNumber,
      customerName,
      customerCpf
    } = req.body as {
      contactId?: string;
      campaignId?: string;
      campaignContactId?: string;
      customerNumber?: string;
      customerName?: string;
      customerCpf?: string;
    };

    if (!customerNumber || !customerName) {
      return res.status(400).json({ success: false, error: 'Telefone e nome sao obrigatorios' });
    }

    let cpf = customerCpf || '';
    if (contactId) {
      const { data } = await supabase.from('contacts').select('cpf').eq('id', contactId).maybeSingle();
      cpf = data?.cpf || cpf;
    }

    const n8nWebhookUrl = await getN8nWebhookUrl(supabase);
    const vapiApiKey = await getVapiApiKey(supabase);

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

    let campaignContactId: string | null = incomingCampaignContactId || null;
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

      campaignContactId = cc?.id || campaignContactId;
      if (cc?.id) {
        await supabase
          .from('campaign_contacts')
          .update({ status: 'em_andamento', ultima_tentativa: new Date().toISOString() })
          .eq('id', cc.id);
      }
    }

    const backendPublicUrl = await getBackendPublicUrl(supabase);
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
      phoneId: null,
      campaignId: campaignId || 'manual',
      customerNumber,
      customerName,
      cpf,
      customerCpf: cpf,
      assistantId,
      phoneNumberId,
      callbackUrl,
      tipoTelefonia: 'vapi'
    };

    let dispatchMode = 'n8n';
    let vapiResult: { status: number; body: any } | null = null;
    let n8nResult: { status: number; body: any } | null = null;

    if (assistantId && phoneNumberId && vapiApiKey) {
      dispatchMode = 'direct_vapi';
      try {
        vapiResult = await createVapiCall(vapiApiKey, {
          assistantId,
          phoneNumberId,
          customer: {
            number: customerNumber,
            name: getVapiCustomerName(customerName)
          },
          metadata: {
            contactId: contactId || null,
            campaignContactId,
            campaignId: campaignId || 'manual',
            phoneId: phoneNumberId,
            cpf,
            customerCpf: cpf,
            customerName,
            customerNumber
          },
          assistantOverrides: {
            serverUrl: callbackUrl,
            serverMessages: ['end-of-call-report'],
            variableValues: {
              Valorcpf: cpf,
              cpf,
              contactId: contactId || '',
              campaignContactId: campaignContactId || '',
              campaignId: campaignId || 'manual',
              customerName,
              customerNumber
            }
          }
        });

        const vapiCallId = vapiResult.body && typeof vapiResult.body === 'object' ? (vapiResult.body as any).id : null;
        if (vapiCallId && callRecord?.id) {
          await supabase.from('calls').update({ vapi_call_id: vapiCallId }).eq('id', callRecord.id);
        }
      } catch (vapiError: any) {
        if (callRecord?.id) {
          await supabase
            .from('calls')
            .update({
              status: 'failed',
              ended_reason: 'vapi-create-call-failed',
              summary: vapiError?.message || 'Falha ao criar chamada na VAPI'
            })
            .eq('id', callRecord.id);
        }
        if (campaignContactId) {
          await supabase
            .from('campaign_contacts')
            .update({ status: 'falhou', ultima_tentativa: new Date().toISOString() })
            .eq('id', campaignContactId);
        }
        throw vapiError;
      }
    } else {
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

      const n8nResponseBody = await parseResponseBody(response);
      const n8nExplicitFailure =
        n8nResponseBody &&
        typeof n8nResponseBody === 'object' &&
        ((n8nResponseBody as any).success === false ||
          (n8nResponseBody as any).ok === false ||
          (n8nResponseBody as any).executed === false ||
          Boolean((n8nResponseBody as any).error));

      if (!response.ok || n8nExplicitFailure) {
        throw new Error(
          typeof n8nResponseBody === 'string'
            ? n8nResponseBody
            : JSON.stringify(n8nResponseBody || { status: response.status, statusText: response.statusText })
        );
      }

      n8nResult = {
        status: response.status,
        body: n8nResponseBody
      };
    }

    return res.json({
      success: true,
      message: 'Ligacao iniciada',
      callId: callRecord?.id ?? null,
      dispatchMode,
      vapi: vapiResult,
      n8n: n8nResult
    });
  } catch (error: any) {
    console.error('[calls/initiate] error', error);
    return res.status(500).json({ success: false, error: error.message || 'Erro interno' });
  }
}
