import { Router } from 'express';
import { env } from '../config/env.js';
import { supabaseAdmin } from '../lib/supabase.js';

export const callsRouter = Router();

callsRouter.post('/initiate', async (req, res) => {
  try {
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
      const { data } = await supabaseAdmin.from('contacts').select('cpf').eq('id', contactId).maybeSingle();
      cpf = data?.cpf || '';
    }

    const { data: n8nSetting } = await supabaseAdmin
      .from('app_settings')
      .select('setting_value')
      .eq('setting_key', 'n8n_webhook_url')
      .limit(1)
      .maybeSingle();

    const n8nWebhookUrl =
      n8nSetting?.setting_value || 'https://n8n-n8n-start.xzz0ed.easypanel.host/webhook/callcenteria';

    let assistantId: string | null = null;
    let phoneNumberId: string | null = null;

    if (campaignId) {
      const { data: campaign } = await supabaseAdmin
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
      const { data: cc } = await supabaseAdmin
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
        await supabaseAdmin
          .from('campaign_contacts')
          .update({ status: 'em_andamento', ultima_tentativa: new Date().toISOString() })
          .eq('id', cc.id);
      }
    }

    const callbackUrl = `${env.backendPublicUrl}/api/webhooks/vapi/callback`;

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

    if (!response.ok) {
      throw new Error(`Erro n8n: ${response.status} ${response.statusText}`);
    }

    return res.json({ success: true, message: 'Ligacao iniciada' });
  } catch (error: any) {
    console.error('[calls/initiate] error', error);
    return res.status(500).json({ success: false, error: error.message || 'Erro interno' });
  }
});
