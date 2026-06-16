import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function getSupabaseAdmin() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false }
  });
}

const formatDuration = (durationSeconds: number) => {
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

function normalizeCall(call: any) {
  const meta = call.metadata_raw && typeof call.metadata_raw === 'object' ? call.metadata_raw : {};
  const analysis =
    (call.analysis && typeof call.analysis === 'object' ? call.analysis : null) ||
    (meta?.analysis && typeof meta.analysis === 'object' ? meta.analysis : {});
  const rawSuccessEval = analysis?.successEvaluation ?? meta?.successEvaluation ?? call.success_evaluation ?? '';
  const normalizedStatus = String(call.status || '').toLowerCase();

  let displayStatus = 'Falhou';
  if (normalizedStatus === 'completed') {
    displayStatus = 'Concluída';
  } else if (normalizedStatus === 'queued') {
    displayStatus = 'Na fila';
  } else if (normalizedStatus === 'em_andamento' || normalizedStatus === 'in-progress' || normalizedStatus === 'in_progress') {
    displayStatus = 'Em andamento';
  }

  return {
    id: call.id,
    vapiCallId: call.vapi_call_id,
    date: call.started_at ? new Date(call.started_at).toLocaleString('pt-BR') : '-',
    campaignName: call.campaign_name || call.campanha || 'Direta',
    clientName: call.cliente || 'Desconhecido',
    cpf: call.cpf || '-',
    phone: call.customer_number || '-',
    duration: formatDuration(Number(call.duration_seconds) || 0),
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
    transcript: call.transcript || meta?.artifact?.transcript || '',
    summary: call.summary,
    structured_name: call.structured_name,
    structured_rating_label: call.structured_rating_label,
    structured_rating_text: call.structured_rating_text,
    structured_purpose: call.structured_purpose,
    structured_main_points: call.structured_main_points,
    analysis,
    raw_summary: analysis?.summary || meta?.summary || call.summary || '',
    raw_success_evaluation: String(rawSuccessEval)
  };
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const statusParam = Array.isArray(req.query.status) ? req.query.status.join(',') : req.query.status;
    const statuses = String(statusParam || '')
      .split(',')
      .map((status) => status.trim().toLowerCase())
      .filter(Boolean)
      .map((status) => (status === 'conpleted' ? 'completed' : status));

    let query = supabaseAdmin
      .from('calls')
      .select(
        'id,campaign_contact_id,contact_phone_id,vapi_call_id,started_at,ended_at,status,ended_reason,duration_seconds,transcript,summary,success_evaluation,custo_total,custo_stt,custo_tts,custo_vapi,created_at,assistant_id,phone_number_id,recording_url,stereo_recording_url,artifact_log_url,structured_name,structured_rating_label,structured_rating_text,structured_purpose,structured_main_points,structured_next_steps,structured_emotions_objections,customer_number,campanha,cpf,cliente'
      )
      .order('started_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1000);

    if (statuses.length === 1) {
      query = query.eq('status', statuses[0]);
    } else if (statuses.length > 1) {
      query = query.or(statuses.map((status) => `status.eq.${status}`).join(','));
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return res.status(200).json((data || []).map(normalizeCall));
  } catch (error: any) {
    console.error('[api/calls] error', error);
    return res.status(500).json({ success: false, error: error.message || 'Erro interno' });
  }
}
