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
const completedEndings = ['assistant-ended-call', 'customer-ended-call'];
const MIN_DURATION_FOR_SUCCESS = 15;
const FORMALIZATION_AGREEMENT_WEBHOOK_URL =
  process.env.N8N_FORMALIZACAO_ACORDO_WEBHOOK_URL ||
  'https://n8n-n8n-start.xzz0ed.easypanel.host/webhook/acordo_formalizado';

export const webhooksRouter = Router();

function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function buildMetadataFromPayload(payload: any, call: any, metadata: any): Record<string, any> {
  const payloadMetadata = isObject(metadata) ? metadata : {};
  const callMetadata = isObject(call?.metadata) ? call.metadata : {};
  const payloadVariableValues = isObject(payload?.assistantOverrides?.variableValues)
    ? payload.assistantOverrides.variableValues
    : {};
  const callVariableValues = isObject(call?.assistantOverrides?.variableValues)
    ? call.assistantOverrides.variableValues
    : {};
  const artifactVariables = isObject(call?.artifact?.variables) ? call.artifact.variables : {};

  return {
    ...payloadMetadata,
    ...payloadVariableValues,
    ...callVariableValues,
    ...artifactVariables,
    ...callMetadata
  };
}

function firstNonEmpty(...values: unknown[]): string | null {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const str = String(value).trim();
    if (str) return str;
  }

  return null;
}

function getCostAmount(cost: any): number {
  const amount = Number(cost?.amount ?? cost?.cost ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function getCostItems(payload: any, call: any): any[] {
  if (Array.isArray(payload?.costs)) return payload.costs;
  if (Array.isArray(call?.costs)) return call.costs;
  if (Array.isArray(payload?.costBreakdown)) return payload.costBreakdown;
  if (Array.isArray(call?.costBreakdown)) return call.costBreakdown;
  return [];
}

function getCallCosts(payload: any, call: any) {
  const costs = getCostItems(payload, call);
  const custo_stt = costs
    .filter((c: any) => ['stt', 'transcription', 'transcriber'].includes(String(c?.type || '').toLowerCase()))
    .reduce((sum: number, cost: any) => sum + getCostAmount(cost), 0);
  const custo_tts = costs
    .filter((c: any) => ['tts', 'voice'].includes(String(c?.type || '').toLowerCase()))
    .reduce((sum: number, cost: any) => sum + getCostAmount(cost), 0);
  const custo_vapi = costs
    .filter((c: any) => ['vapi', 'service'].includes(String(c?.type || '').toLowerCase()))
    .reduce((sum: number, cost: any) => sum + getCostAmount(cost), 0);
  const itemTotal = costs.reduce((sum: number, cost: any) => sum + getCostAmount(cost), 0);
  const custo_total = itemTotal || Number(payload?.cost ?? call?.cost ?? call?.custo_total ?? 0) || 0;

  return { custo_total, custo_stt, custo_tts, custo_vapi };
}

function buildFormalizationPayload(payload: any, call: any, metadataFromCall: Record<string, any>, callDbId: string) {
  const assistantVariableValues = {
    ...(isObject(call?.assistantOverrides?.variableValues) ? call.assistantOverrides.variableValues : {}),
    ...(isObject(payload?.assistantOverrides?.variableValues) ? payload.assistantOverrides.variableValues : {})
  };

  const cpf = firstNonEmpty(
    metadataFromCall.cpf,
    metadataFromCall.Valorcpf,
    metadataFromCall.valorcpf,
    assistantVariableValues.Valorcpf,
    assistantVariableValues.cpf
  );

  const artifact = isObject(call?.artifact) ? call.artifact : {};
  const artifactVariables = {
    ...(isObject(artifact.variables) ? artifact.variables : {}),
    ...assistantVariableValues,
    ...(cpf ? { Valorcpf: cpf } : {})
  };

  return {
    type: 'end-of-call-report',
    table: 'calls',
    record: {
      id: callDbId,
      vapi_call_id: call?.id || null,
      cliente: firstNonEmpty(call?.customer?.name, metadataFromCall.customerName, metadataFromCall.nome),
      cpf,
      customer_number: firstNonEmpty(call?.customer?.number, metadataFromCall.customerNumber, metadataFromCall.telefone),
      started_at: call?.startedAt || null,
      ended_at: call?.endedAt || null,
      status: firstNonEmpty(call?.status, 'ended'),
      ended_reason: call?.endedReason || null,
      summary: firstNonEmpty(call?.analysis?.summary, call?.summary),
      transcript: firstNonEmpty(call?.artifact?.transcript, call?.transcript),
      metadata_raw: {
        ...payload,
        call,
        metadata: metadataFromCall,
        artifact: {
          ...artifact,
          variables: artifactVariables
        }
      }
    }
  };
}

async function postFormalizationAgreementWebhook(
  payload: any,
  call: any,
  metadataFromCall: Record<string, any>,
  callDbId: string
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(FORMALIZATION_AGREEMENT_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-source': 'callcenteria-backend',
        'x-event-type': 'end-of-call-report'
      },
      body: JSON.stringify(buildFormalizationPayload(payload, call, metadataFromCall, callDbId)),
      signal: controller.signal
    });

    if (!response.ok) {
      const responseBody = await response.text().catch(() => '');
      console.error('[webhooks/vapi/callback] formalization webhook error', {
        status: response.status,
        statusText: response.statusText,
        responseBody
      });
    }
  } catch (error) {
    console.error('[webhooks/vapi/callback] formalization webhook failed', error);
  } finally {
    clearTimeout(timeout);
  }
}

webhooksRouter.post('/vapi/callback', async (req, res) => {
  try {
    let payload: any = req.body;
    if (payload?.message) payload = payload.message;

    if (payload?.type !== 'end-of-call-report') {
      return res.status(200).json({ success: false, error: 'Event type ignored', type: payload?.type });
    }

    const { call, metadata } = payload;
    if (!call || typeof call !== 'object') {
      return res.status(400).json({ success: false, error: 'Payload sem objeto call' });
    }

    const metadataFromCall = buildMetadataFromPayload(payload, call, metadata);
    const callId = firstNonEmpty(call.id, call.callId, payload.callId, payload.id);
    if (!callId) {
      return res.status(400).json({ success: false, error: 'Payload sem id da chamada VAPI' });
    }

    const campaignContactIdFromMetadata = firstNonEmpty(
      metadataFromCall.campaignContactId,
      metadataFromCall.campaign_contact_id,
      metadataFromCall.campaignContactID,
      metadataFromCall.rowNumber
    );
    const phoneIdFromMetadata = firstNonEmpty(metadataFromCall.phoneId, metadataFromCall.contactPhoneId, metadataFromCall.phone_id);
    const startedAtValue = firstNonEmpty(call.startedAt, call.started_at, payload.startedAt, payload.started_at);
    const endedAtValue = firstNonEmpty(call.endedAt, call.ended_at, payload.endedAt, payload.ended_at);
    const endedReason = firstNonEmpty(call.endedReason, call.ended_reason, payload.endedReason, payload.ended_reason);
    const statusValue = [...successfulEndings, ...completedEndings].includes(endedReason || '')
      ? 'completed'
      : endedReason || firstNonEmpty(call.status, payload.status) || 'completed';

    let existingCall: { id: string; campaign_contact_id: string | null } | null = null;
    const { data: foundCall, error: findError } = await supabaseAdmin
      .from('calls')
      .select('id, campaign_contact_id')
      .eq('vapi_call_id', callId)
      .maybeSingle();
    if (findError) throw new Error(`Erro ao buscar chamada: ${findError.message}`);

    if (!foundCall && campaignContactIdFromMetadata) {
      const { data: orphanCall } = await supabaseAdmin
        .from('calls')
        .select('id, campaign_contact_id')
        .eq('campaign_contact_id', campaignContactIdFromMetadata)
        .is('vapi_call_id', null)
        .is('started_at', null)
        .is('metadata_raw', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (orphanCall) {
        existingCall = orphanCall;
        await supabaseAdmin.from('calls').update({ vapi_call_id: callId }).eq('id', orphanCall.id);

        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        await supabaseAdmin
          .from('calls')
          .delete()
          .eq('campaign_contact_id', campaignContactIdFromMetadata)
          .is('vapi_call_id', null)
          .neq('id', orphanCall.id)
          .lt('created_at', tenMinutesAgo);
      }
    }

    if (!existingCall && !foundCall) {
      const { data: newCall, error: insertError } = await supabaseAdmin
        .from('calls')
        .insert({
          vapi_call_id: callId,
          campaign_contact_id: campaignContactIdFromMetadata || null,
          contact_phone_id: phoneIdFromMetadata || null,
          status: 'queued'
        })
        .select('id, campaign_contact_id')
        .maybeSingle();

      if (insertError) {
        const { data: retryCall } = await supabaseAdmin
          .from('calls')
          .select('id, campaign_contact_id')
          .eq('vapi_call_id', callId)
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

    const startedAt = startedAtValue ? new Date(startedAtValue) : null;
    const endedAt = endedAtValue ? new Date(endedAtValue) : null;
    const hasValidDates =
      startedAt instanceof Date &&
      endedAt instanceof Date &&
      Number.isFinite(startedAt.getTime()) &&
      Number.isFinite(endedAt.getTime());
    const durationSeconds = hasValidDates
      ? Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000))
      : Number(call.durationSeconds ?? call.duration_seconds ?? call.duration ?? 0) || 0;

    const { custo_total, custo_stt, custo_tts, custo_vapi } = getCallCosts(payload, call);

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

    const updateData = {
      vapi_call_id: callId,
      campaign_contact_id: campaignContactIdFromMetadata ?? existingCall.campaign_contact_id ?? null,
      contact_phone_id: phoneIdFromMetadata,
      started_at: startedAtValue,
      ended_at: endedAtValue,
      ended_reason: endedReason,
      duration_seconds: durationSeconds,
      custo_total,
      custo_stt,
      custo_tts,
      custo_vapi,
      summary: firstNonEmpty(call.analysis?.summary, call.summary, payload.summary),
      success_evaluation: successEvaluation,
      transcript: firstNonEmpty(call.artifact?.transcript, call.transcript, payload.transcript),
      recording_url: firstNonEmpty(call.artifact?.recording?.url, call.recordingUrl, call.recording_url),
      stereo_recording_url: firstNonEmpty(call.artifact?.recording?.stereoRecordingUrl, call.stereoRecordingUrl, call.stereo_recording_url),
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
      status: statusValue
    };

    const { error: updateError } = await supabaseAdmin.from('calls').update(updateData).eq('id', existingCall.id);
    if (updateError) throw new Error(`Erro ao atualizar chamada: ${updateError.message}`);

    await postFormalizationAgreementWebhook(payload, call, metadataFromCall, existingCall.id);

    const campaignContactId = existingCall.campaign_contact_id || campaignContactIdFromMetadata;
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
        } else if (successfulEndings.includes(endedReason || '') && durationSeconds >= MIN_DURATION_FOR_SUCCESS) {
          newStatus = 'concluido';
        } else if ((campaignContact.tentativas_realizadas || 0) >= maxTentativas) {
          newStatus = 'falhou';
        } else if (technicalFailures.includes(endedReason || '')) {
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
