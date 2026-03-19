import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabase.js';

const technicalFailures = [
  'voicemail-reached',
  'pipeline-error-openai-voice-failed',
  'assistant-not-found',
  'invalid-number',
  'no-answer',
  'busy'
];
const successfulEndings = ['customer-ended-call', 'assistant-ended-call', 'Sem Débito', 'Sem DÃ©bito'];
const MIN_DURATION_FOR_SUCCESS = 15;

export const webhooksRouter = Router();

webhooksRouter.post('/vapi/callback', async (req, res) => {
  try {
    let payload: any = req.body;
    if (payload?.message) payload = payload.message;

    if (payload?.type !== 'end-of-call-report') {
      return res.status(200).json({ success: false, error: 'Event type ignored', type: payload?.type });
    }

    const { call, metadata } = payload;
    const metadataFromCall = call?.metadata ?? metadata ?? {};

    let existingCall: { id: string; campaign_contact_id: string | null } | null = null;
    const { data: foundCall, error: findError } = await supabaseAdmin
      .from('calls')
      .select('id, campaign_contact_id')
      .eq('vapi_call_id', call.id)
      .maybeSingle();
    if (findError) throw new Error(`Erro ao buscar chamada: ${findError.message}`);

    if (!foundCall && metadata?.campaignContactId) {
      const { data: orphanCall } = await supabaseAdmin
        .from('calls')
        .select('id, campaign_contact_id')
        .eq('campaign_contact_id', metadata.campaignContactId)
        .is('vapi_call_id', null)
        .eq('status', 'queued')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (orphanCall) {
        existingCall = orphanCall;
        await supabaseAdmin.from('calls').update({ vapi_call_id: call.id }).eq('id', orphanCall.id);

        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        await supabaseAdmin
          .from('calls')
          .delete()
          .eq('campaign_contact_id', metadata.campaignContactId)
          .is('vapi_call_id', null)
          .neq('id', orphanCall.id)
          .lt('created_at', tenMinutesAgo);
      }
    }

    if (!existingCall && !foundCall) {
      const { data: newCall, error: insertError } = await supabaseAdmin
        .from('calls')
        .insert({
          vapi_call_id: call.id,
          campaign_contact_id: metadataFromCall?.campaignContactId || null,
          contact_phone_id: metadataFromCall?.phoneId || null,
          status: 'queued'
        })
        .select('id, campaign_contact_id')
        .maybeSingle();

      if (insertError) {
        const { data: retryCall } = await supabaseAdmin
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
      status: [...completedEndings, 'Sem Débito', 'Sem DÃ©bito'].includes(call.endedReason) ? 'completed' : call.endedReason
    };

    const { error: updateError } = await supabaseAdmin.from('calls').update(updateData).eq('id', existingCall.id);
    if (updateError) throw new Error(`Erro ao atualizar chamada: ${updateError.message}`);

    const campaignContactId = existingCall.campaign_contact_id || metadata?.campaignContactId;
    if (campaignContactId) {
      const { data: campaignContact, error: ccError } = await supabaseAdmin
        .from('campaign_contacts')
        .select('tentativas_realizadas, campaign_id(max_tentativas)')
        .eq('id', campaignContactId)
        .single();

      if (!ccError && campaignContact) {
        const maxTentativas = (campaignContact.campaign_id as any)?.max_tentativas || 3;
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

        await supabaseAdmin
          .from('campaign_contacts')
          .update({ status: newStatus, ultima_tentativa: new Date().toISOString() })
          .eq('id', campaignContactId);
      }
    }

    return res.status(200).json({ success: true, callId: existingCall.id, message: 'Callback processado com sucesso' });
  } catch (error: any) {
    console.error('[webhooks/vapi/callback] error', error);
    return res.status(500).json({ success: false, error: error.message || 'Erro interno do servidor' });
  }
});
