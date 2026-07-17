import { Router } from 'express';
import { env } from '../config/env.js';
import { createQueuedCallRecord, getBackendPublicUrl } from '../lib/calls.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { buildCallDispatchPayload, enqueueCallDispatch } from '../queues/callDispatch.js';

export const callsRouter = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_RE.test(value);
const IN_CHUNK_SIZE = 200;
const chunkArray = <T>(items: T[], size: number): T[][] => {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const firstNonEmpty = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  return '';
};

const isCompletedEnding = (endedReason: unknown): boolean =>
  ['assistant-ended-call', 'customer-ended-call', 'Sem Débito', 'Sem DÃ©bito', 'Sem DÃƒÂ©bito'].includes(
    String(endedReason || '')
  );

const getDisplayStatus = (status: unknown, endedReason: unknown): string => {
  const normalizedStatus = String(status || '').toLowerCase();
  const hasEndedReason = Boolean(String(endedReason || '').trim());

  if (normalizedStatus === 'completed' || isCompletedEnding(endedReason)) {
    return 'ConcluÃ­da';
  }

  if (!hasEndedReason && normalizedStatus === 'queued') {
    return 'Na fila';
  }

  if (
    normalizedStatus === 'em_andamento' ||
    normalizedStatus === 'in-progress' ||
    normalizedStatus === 'in_progress'
  ) {
    return 'Em andamento';
  }

  return 'Falhou';
};

const transcriptFromMessages = (messages: unknown): string => {
  if (!Array.isArray(messages)) return '';

  return messages
    .map((message: any) => {
      const role = String(message?.role || '').toLowerCase();
      if (!['assistant', 'ai', 'bot', 'user'].includes(role)) return '';

      const content = firstNonEmpty(message?.message, message?.content, message?.text);
      if (!content) return '';

      const label = role === 'user' ? 'User' : 'AI';
      return `${label}: ${content}`;
    })
    .filter(Boolean)
    .join('\n');
};

const getTranscript = (call: any, meta: any, analysis: any): string =>
  firstNonEmpty(
    call.transcript,
    analysis?.transcript,
    meta?.transcript,
    meta?.artifact?.transcript,
    meta?.call?.transcript,
    transcriptFromMessages(meta?.artifact?.messages)
  );

const parseMetadata = (raw: any): any => {
  if (raw && typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  return raw && typeof raw === 'object' ? raw : {};
};

const normalizeCallDetail = (call: any) => {
  const durationSeconds = Number(call.duration_seconds) || 0;
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  const durationFormatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  const meta = parseMetadata(call.metadata_raw);
  const analysis =
    (call.analysis && typeof call.analysis === 'object' ? call.analysis : null) ||
    (meta?.analysis && typeof meta.analysis === 'object' ? meta.analysis : {});
  const rawSummary: string = analysis?.summary || meta?.summary || call.summary || '';
  const rawSuccessEval: string =
    analysis?.successEvaluation ?? meta?.successEvaluation ?? call.success_evaluation ?? '';
  const displayStatus = getDisplayStatus(call.status, call.ended_reason);

  return {
    id: call.id,
    vapiCallId: call.vapi_call_id,
    date: call.started_at ? new Date(call.started_at).toLocaleString('pt-BR') : '-',
    campaignName: call.campaign_name || call.campanha || 'Direta',
    clientName: call.cliente || 'Desconhecido',
    cpf: call.cpf || '-',
    phone: call.customer_number || '-',
    duration: durationFormatted,
    status: displayStatus,
    reason: call.ended_reason || '-',
    success:
      call.success_evaluation === 'true' ||
      call.success_evaluation === true ||
      String(rawSuccessEval).toLowerCase() === 'true',
    cost: Number(call.custo_total) || 0,
    custo_stt: Number(call.custo_stt) || 0,
    custo_tts: Number(call.custo_tts) || 0,
    custo_vapi: Number(call.custo_vapi) || 0,
    custo_total: Number(call.custo_total) || 0,
    recordingUrl: call.recording_url,
    stereoRecordingUrl: call.stereo_recording_url,
    transcript: getTranscript(call, meta, analysis),
    summary: call.summary,
    structured_name: call.structured_name,
    structured_rating_label: call.structured_rating_label,
    structured_rating_text: call.structured_rating_text,
    structured_purpose: call.structured_purpose,
    structured_main_points: call.structured_main_points,
    analysis,
    metadata_raw: meta,
    raw_summary: rawSummary,
    raw_success_evaluation: String(rawSuccessEval)
  };
};

callsRouter.get('/', async (req, res) => {
  try {
    const rawStatus = req.query.status;
    const statusTokens = Array.isArray(rawStatus)
      ? rawStatus.filter((token): token is string => typeof token === 'string')
      : typeof rawStatus === 'string'
        ? [rawStatus]
        : [];
    const normalizedStatusList = statusTokens
      .flatMap((token) => token.split(','))
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .map((s) => (s === 'conpleted' ? 'completed' : s));

    const historyOnly = String(req.query.history || '').toLowerCase() === 'true';

    let callsQuery = supabaseAdmin
      .from('calls')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(10000);

    if (historyOnly) {
      callsQuery = callsQuery.not('vapi_call_id', 'is', null);
    } else if (normalizedStatusList.length === 1) {
      callsQuery = callsQuery.eq('status', normalizedStatusList[0]);
    } else if (normalizedStatusList.length > 1) {
      const orExpr = normalizedStatusList.map((status) => `status.eq.${status}`).join(',');
      callsQuery = callsQuery.or(orExpr);
    }

    const { data: calls, error: callsError } = await callsQuery;

    if (callsError) {
      throw new Error(callsError.message);
    }

    const callRows = calls || [];
    const campaignContactIds = Array.from(
      new Set(callRows.map((row: any) => row.campaign_contact_id).filter(isUuid))
    );

    const campaignContactsById = new Map<string, any>();
    if (campaignContactIds.length > 0) {
      for (const idChunk of chunkArray(campaignContactIds, IN_CHUNK_SIZE)) {
        const { data: ccRows, error: ccError } = await supabaseAdmin
          .from('campaign_contacts')
          .select('id, campaign_id, contact_id')
          .in('id', idChunk);

        if (ccError) {
          throw new Error(ccError.message);
        }

        (ccRows || []).forEach((row: any) => {
          campaignContactsById.set(row.id, row);
        });
      }
    }

    const campaignIds = Array.from(
      new Set(Array.from(campaignContactsById.values()).map((row: any) => row.campaign_id).filter(isUuid))
    );
    const campaignsById = new Map<string, any>();
    if (campaignIds.length > 0) {
      for (const idChunk of chunkArray(campaignIds, IN_CHUNK_SIZE)) {
        const { data: campaignRows, error: campaignError } = await supabaseAdmin
          .from('campaigns')
          .select('id, nome')
          .in('id', idChunk);

        if (campaignError) {
          throw new Error(campaignError.message);
        }

        (campaignRows || []).forEach((row: any) => {
          campaignsById.set(row.id, row);
        });
      }
    }

    const contactIds = Array.from(
      new Set(Array.from(campaignContactsById.values()).map((row: any) => row.contact_id).filter(isUuid))
    );
    const contactsById = new Map<string, any>();
    if (contactIds.length > 0) {
      for (const idChunk of chunkArray(contactIds, IN_CHUNK_SIZE)) {
        const { data: contactRows, error: contactError } = await supabaseAdmin
          .from('contacts')
          .select('id, nome, cpf, telefone')
          .in('id', idChunk);

        if (contactError) {
          throw new Error(contactError.message);
        }

        (contactRows || []).forEach((row: any) => {
          contactsById.set(row.id, row);
        });
      }
    }

    const normalized = callRows.map((call: any) => {
      const durationSeconds = Number(call.duration_seconds) || 0;
      const minutes = Math.floor(durationSeconds / 60);
      const seconds = durationSeconds % 60;
      const durationFormatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;

      const campaignContact = campaignContactsById.get(call.campaign_contact_id);
      const campaignRow = campaignContact ? campaignsById.get(campaignContact.campaign_id) : null;
      const contactRow = campaignContact ? contactsById.get(campaignContact.contact_id) : null;

      const meta = parseMetadata(call.metadata_raw);

      const analysis =
        (call.analysis && typeof call.analysis === 'object' ? call.analysis : null) ||
        (meta?.analysis && typeof meta.analysis === 'object' ? meta.analysis : {});

      let campaignName = 'Direta';
      if (campaignRow?.nome) {
        campaignName = campaignRow.nome;
      } else if (call.campaign_name) {
        campaignName = call.campaign_name;
      } else if (call.campanha) {
        campaignName = call.campanha;
      }

      const rawSummary: string = analysis?.summary || meta?.summary || call.summary || '';
      const rawSuccessEval: string =
        analysis?.successEvaluation ?? meta?.successEvaluation ?? call.success_evaluation ?? '';

      const displayStatus = getDisplayStatus(call.status, call.ended_reason);

      return {
        id: call.id,
        vapiCallId: call.vapi_call_id,
        date: call.started_at ? new Date(call.started_at).toLocaleString('pt-BR') : '-',
        campaignName,
        clientName: call.cliente || contactRow?.nome || 'Desconhecido',
        cpf: call.cpf || contactRow?.cpf || '-',
        phone: call.customer_number || contactRow?.telefone || '-',
        duration: durationFormatted,
        status: displayStatus,
        reason: call.ended_reason || '-',
        success:
          call.success_evaluation === 'true' ||
          call.success_evaluation === true ||
          String(rawSuccessEval).toLowerCase() === 'true',
        cost: Number(call.custo_total) || 0,
        custo_stt: Number(call.custo_stt) || 0,
        custo_tts: Number(call.custo_tts) || 0,
        custo_vapi: Number(call.custo_vapi) || 0,
        custo_total: Number(call.custo_total) || 0,
        recordingUrl: call.recording_url,
        stereoRecordingUrl: call.stereo_recording_url,
        transcript: getTranscript(call, meta, analysis),
        summary: call.summary,
        structured_name: call.structured_name,
        structured_rating_label: call.structured_rating_label,
        structured_rating_text: call.structured_rating_text,
        structured_purpose: call.structured_purpose,
        structured_main_points: call.structured_main_points,
        analysis,
        metadata_raw: meta,
        raw_summary: rawSummary,
        raw_success_evaluation: String(rawSuccessEval)
      };
    });

    return res.json(normalized);
  } catch (error: any) {
    console.error('[calls/list] error', error);
    return res.status(500).json({ success: false, error: error.message || 'Erro interno' });
  }
});

callsRouter.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(400).json({ success: false, error: 'id invalido' });
    }

    const { data: call, error } = await supabaseAdmin
      .from('calls')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!call) {
      return res.status(404).json({ success: false, error: 'Ligacao nao encontrada' });
    }

    return res.json(normalizeCallDetail(call));
  } catch (error: any) {
    console.error('[calls/detail] error', error);
    return res.status(500).json({ success: false, error: error.message || 'Erro interno' });
  }
});

callsRouter.post('/initiate', async (req, res) => {
  try {
    const { contactId, campaignId, campaignContactId: incomingCampaignContactId, customerNumber, customerName, customerCpf } = req.body as {
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

    if (!env.rabbitmqUrl) {
      throw new Error('RABBITMQ_URL nao configurada para enfileirar chamadas');
    }

    let cpf = customerCpf || '';
    if (contactId) {
      const { data } = await supabaseAdmin.from('contacts').select('cpf').eq('id', contactId).maybeSingle();
      cpf = data?.cpf || cpf;
    }

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

    let campaignContactId: string | null = incomingCampaignContactId || null;
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

      campaignContactId = cc?.id || campaignContactId;

      if (cc?.id) {
        await supabaseAdmin
          .from('campaign_contacts')
          .update({ status: 'em_andamento', ultima_tentativa: new Date().toISOString() })
          .eq('id', cc.id);
      }
    }

    const resolvedBackendPublicUrl = await getBackendPublicUrl();
    const callbackUrl = `${resolvedBackendPublicUrl}/api/webhooks/vapi/callback`;

    await createQueuedCallRecord({
      campaignContactId,
      contactPhoneId: null,
      customerNumber,
      campaignName: campaignId ? null : 'Direta',
      customerCpf: cpf,
      customerName,
      assistantId,
      phoneNumberId
    });

    const queuePayload = buildCallDispatchPayload({
      source: campaignId ? 'campaign' : 'manual',
      contactId: contactId || null,
      campaignContactId,
      campaignId: campaignId || 'manual',
      customerNumber,
      customerName,
      customerCpf: cpf,
      phoneId: null,
      assistantId,
      phoneNumberId,
      callbackUrl,
      tipoTelefonia: 'vapi'
    });

    await enqueueCallDispatch(queuePayload);

    return res.json({
      success: true,
      message: 'Ligacao enfileirada',
      queue: env.rabbitmqCallDispatchQueue,
      queuedAt: queuePayload.queuedAt
    });
  } catch (error: any) {
    console.error('[calls/initiate] error', error);
    return res.status(500).json({ success: false, error: error.message || 'Erro interno' });
  }
});
