import { createClient } from '@supabase/supabase-js';

const technicalFailures = [
  'voicemail-reached',
  'pipeline-error-openai-voice-failed',
  'assistant-not-found',
  'invalid-number',
  'no-answer',
  'busy'
];
const successfulEndings = ['customer-ended-call', 'assistant-ended-call', 'Sem DÃ©bito', 'Sem DÃƒÂ©bito'];
const MIN_DURATION_FOR_SUCCESS = 15;

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY nÃ£o configurados');
  return createClient(url, key, { auth: { persistSession: false } });
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'MÃ©todo nÃ£o permitido' });

  try {
    let payload: any = req.body;
    if (payload?.message) payload = payload.message;

    if (payload?.type !== 'end-of-call-report') {
      return res.status(200).json({ success: false, error: 'Event type ignored', type: payload?.type });
    }

    const supabase = getSupabaseAdmin();
    const { call, metadata } = payload;
    const metadataFromCall = call?.metadata ?? metadata ?? {};

    let existingCall: { id: string; campaign_contact_id: string | null } | null = null;
    const { data: foundCall, error: findError } = await supabase
      .from('calls')
      .select('id, campaign_contact_id')
      .eq('vapi_call_id', call.id)
      .maybeSingle();
    if (findError) throw new Error(`Erro ao buscar chamada: ${findError.message}`);

    if (!foundCall && metadataFromCall?.campaignContactId) {
      const { data: orphanCall, error: orphanError } = await supabase
        .from('calls')
        .select('id, campaign_contact_id')
        .eq('campaign_contact_id', metadataFromCall.campaignContactId)
        .is('vapi_call_id', null)
        .in('status', ['queued', 'em_andamento'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (orphanError) throw new Error(`Erro ao buscar chamada Ã³rfÃ£: ${orphanError.message}`);

      if (orphanCall) {
        existingCall = orphanCall;
        await supabase.from('calls').update({ vapi_call_id: call.id }).eq('id', orphanCall.id);

        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        await supabase
          .from('calls')
          .delete()
          .eq('campaign_contact_id', metadataFromCall.campaignContactId)
          .is('vapi_call_id', null)
          .neq('id', orphanCall.id)
          .lt('created_at', tenMinutesAgo);
      }
    }

    if (!existingCall && !foundCall) {
      const { data: newCall, error: insertError } = await supabase
        .from('calls')
        .insert({
          vapi_call_id: call.id,
          campaign_contact_id: metadataFromCall?.campaignContactId || null,
          contact_phone_id: metadataFromCall?.phoneId || null,
          customer_number: call?.customer?.number || null,
          cliente: call?.customer?.name || null,
          cpf: metadataFromCall?.cpf || null,
          assistant_id: call?.assistantId || null,
          phone_number_id: call?.phoneNumberId || null,
          status: 'queued'
        })
        .select('id, campaign_contact_id')
        .maybeSingle();

      if (insertError) {
        const { data: retryCall } = await supabase
          .from('calls')
          .select('id, campaign_contact_id')
          .eq('vapi_call_id', call.id)
          .maybeSingle();
        if (!retryCall) throw new Error(`Erro ao criar chamada: ${insertError.message}`);
        existingCall = retryCall;
      } else {
        existingCall = newCall;
      }
    } else if (!existingCall) {
      existingCall = foundCall;
    }

    if (!existingCall) throw new Error('Falha ao obter registro de chamada');

    const startedAt = new Date(call.startedAt);
    const endedAt = new Date(call.endedAt);
    const durationSeconds = Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000);

    const costs = call.costs || [];
    const custo_stt = costs.find((c: any) => c.type === 'stt' || c.type === 'transcription')?.amount || 0;
    const custo_tts = costs.find((c: any) => c.type === 'tts' || c.type === 'voice')?.amount || 0;
    const custo_vapi = costs.find((c: any) => c.type === 'vapi' || c.type === 'service')?.amount || 0;
    const custo_total = costs.reduce((sum: number, cost: any) => sum + (cost.amount || 0), 0);

    const structuredData = call.analysis?.structuredData || {};
    let successEvaluation: string | null = null;
    if (call.analysis?.successEvaluation !== undefined) {
      successEvaluation =
        typeof call.analysis.successEvaluation === 'boolean'
          ? call.analysis.successEvaluation
            ? 'true'
            : 'false'
          : String(call.analysis.successEvaluation);
    }

    const completedEndings = ['assistant-ended-call', 'customer-ended-call'];
    const updateData = {
      campaign_contact_id: metadataFromCall.campaignContactId ?? existingCall.campaign_contact_id ?? null,
      contact_phone_id: metadataFromCall.phoneId ?? null,
      customer_number: call?.customer?.number || null,
      cliente: call?.customer?.name || null,
      cpf: metadataFromCall?.cpf || null,
      started_at: call.startedAt,
      ended_at: call.endedAt,
      ended_reason: call.endedReason,
      duration_seconds: durationSeconds,
      custo_total,
      custo_stt,
      custo_tts,
      custo_vapi,
      summary: call.analysis?.summary || null,
      success_evaluation: successEvaluation,
      transcript: call.artifact?.transcript || null,
      recording_url: call.artifact?.recording?.url || null,
      stereo_recording_url: call.artifact?.recording?.stereoRecordingUrl || null,
      artifact_log_url: call.artifact?.artifactLogUrl || null,
      assistant_id: call.assistantId || null,
      phone_number_id: call.phoneNumberId || null,
      structured_name: structuredData.name || null,
      structured_rating_label: structuredData.rating?.label || null,
      structured_rating_text: structuredData.rating?.text || null,
      structured_purpose: structuredData.purpose || null,
      structured_main_points: structuredData.mainPoints || null,
      structured_next_steps: structuredData.nextSteps || null,
      structured_emotions_objections: structuredData.emotionsObjections || null,
      metadata_raw: payload,
      status: [...completedEndings, 'Sem DÃ©bito', 'Sem DÃƒÂ©bito'].includes(call.endedReason) ? 'completed' : call.endedReason
    };

    const { error: updateError } = await supabase.from('calls').update(updateData).eq('id', existingCall.id);
    if (updateError) throw new Error(`Erro ao atualizar chamada: ${updateError.message}`);

    const campaignContactId = existingCall.campaign_contact_id || metadataFromCall?.campaignContactId;
    if (campaignContactId) {
      const { data: campaignContact, error: ccError } = await supabase
        .from('campaign_contacts')
        .select('tentativas_realizadas, campaign_id')
        .eq('id', campaignContactId)
        .single();

      if (!ccError && campaignContact) {
        const { data: campaign, error: campaignError } = await supabase
          .from('campaigns')
          .select('max_tentativas')
          .eq('id', campaignContact.campaign_id)
          .maybeSingle();
        if (campaignError) throw new Error(`Erro ao buscar campanha do contato: ${campaignError.message}`);

        const maxTentativas = campaign?.max_tentativas || 3;
        let newStatus = 'pendente';

        if (successEvaluation === 'true') {
          newStatus = 'concluido';
        } else if (successfulEndings.includes(call.endedReason) && durationSeconds >= MIN_DURATION_FOR_SUCCESS) {
          newStatus = 'concluido';
        } else if ((campaignContact.tentativas_realizadas || 0) >= maxTentativas) {
          newStatus = 'falhou';
        } else if (technicalFailures.includes(call.endedReason)) {
          newStatus = 'pendente';
        }

        await supabase
          .from('campaign_contacts')
          .update({ status: newStatus, ultima_tentativa: new Date().toISOString() })
          .eq('id', campaignContactId);
      }
    }

    return res.status(200).json({ success: true, callId: existingCall.id, message: 'Callback processado com sucesso' });
  } catch (error: any) {
    console.error('[api/webhooks/vapi/callback] error', error);
    return res.status(500).json({ success: false, error: error.message || 'Erro interno' });
  }
}
