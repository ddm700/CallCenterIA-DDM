import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { format, toZonedTime } from 'date-fns-tz';
import { waitUntil } from '@vercel/functions';

// ---------------------------------------------------------------------------
// Config from env vars (mirrors callcenteria-merge/backend/src/config/env.ts)
// ---------------------------------------------------------------------------
function nonNegativeInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

const cfg = {
  maxConcurrency:      Math.max(1, nonNegativeInt('CAMPAIGN_START_MAX_CONCURRENCY', 6)),
  batchSize:           Math.max(1, nonNegativeInt('CAMPAIGN_START_BATCH_SIZE', 500)),
  pauseMs:             nonNegativeInt('CAMPAIGN_START_PAUSE_MS', 90000),
  requestIntervalMs:   nonNegativeInt('CAMPAIGN_START_REQUEST_INTERVAL_MS', 250),
  maxRetries:          nonNegativeInt('CAMPAIGN_START_MAX_RETRIES', 5),
  retryBaseMs:         nonNegativeInt('CAMPAIGN_START_RETRY_BASE_MS', 2000),
  retryMaxMs:          nonNegativeInt('CAMPAIGN_START_RETRY_MAX_MS', 30000),
};

const SUPABASE_PAGE_SIZE = 1000;

// ---------------------------------------------------------------------------
// RequestPacer — garante intervalo mínimo entre requisições HTTP
// (port fiel de callcenteria-merge/backend/src/services/callDispatch.ts)
// ---------------------------------------------------------------------------
class RequestPacer {
  private nextAllowedAt = 0;
  private queue = Promise.resolve();

  async waitTurn(minIntervalMs: number): Promise<void> {
    if (minIntervalMs <= 0) return;
    let delay = 0;
    const reservation = this.queue.then(() => {
      const now = Date.now();
      const scheduledAt = Math.max(now, this.nextAllowedAt);
      this.nextAllowedAt = scheduledAt + minIntervalMs;
      delay = scheduledAt - now;
    });
    this.queue = reservation.catch(() => undefined);
    await reservation;
    if (delay > 0) await sleep(delay);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function processWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  handler: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await handler(items[i], i);
      }
    })
  );
  return results;
}

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const s = parseFloat(header);
  if (Number.isFinite(s) && s >= 0) return Math.round(s * 1000);
  const t = Date.parse(header);
  return isNaN(t) ? null : Math.max(0, t - Date.now());
}

function computeBackoffMs(attempt: number, retryAfterMs: number | null): number {
  if (retryAfterMs !== null) return Math.min(cfg.retryMaxMs, retryAfterMs);
  const exp = cfg.retryBaseMs * 2 ** attempt;
  const jitter = Math.floor(Math.random() * Math.max(1, cfg.retryBaseMs));
  return Math.min(cfg.retryMaxMs, exp + jitter);
}

const DISPATCH_HEADERS = {
  'Content-Type': 'application/json',
  'x-source': 'node-backend',
  'x-function-name': 'initiate-vapi-call',
  'x-system': 'discador-vapi',
  'x-version': '1.0',
};

// ---------------------------------------------------------------------------
// postWebhookWithRetries — exponential backoff + jitter + 429 handling
// (port fiel de callcenteria-merge/backend/src/services/callDispatch.ts)
// ---------------------------------------------------------------------------
async function postWebhookWithRetries(
  url: string,
  payload: Record<string, unknown>,
  pacer: RequestPacer
): Promise<{ ok: boolean; error?: string }> {
  const attempts = Math.max(1, cfg.maxRetries + 1);

  for (let attempt = 0; attempt < attempts; attempt++) {
    await pacer.waitTurn(cfg.requestIntervalMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: DISPATCH_HEADERS,
        body: JSON.stringify(payload),
      });
    } catch (e: any) {
      if (attempt < attempts - 1) {
        await sleep(computeBackoffMs(attempt, null));
        continue;
      }
      return { ok: false, error: e.message };
    }

    const rawBody = await response.text().catch(() => '');
    let parsed: any = null;
    try { parsed = rawBody ? JSON.parse(rawBody) : null; } catch {}

    const explicitFailure =
      parsed && typeof parsed === 'object' &&
      (parsed.success === false || parsed.ok === false || parsed.executed === false || Boolean(parsed.error));

    if (response.ok && !explicitFailure) return { ok: true };

    if (response.status === 429 && attempt < attempts - 1) {
      await sleep(computeBackoffMs(attempt, parseRetryAfterMs(response.headers.get('retry-after'))));
      continue;
    }

    const errMsg =
      (explicitFailure && parsed && (parsed.error || parsed.message)) ||
      parsed ||
      `Erro n8n: ${response.status} ${response.statusText}`;

    return { ok: false, error: typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg) };
  }

  return { ok: false, error: 'Retry encerrado sem retorno' };
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------
function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados');
  return createClient(url, key, { auth: { persistSession: false } });
}

type ServerLogLevel = 'info' | 'warn' | 'error' | 'success';

function serializeError(error: unknown): Record<string, unknown> | null {
  if (!error) return null;
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
    };
  }
  if (typeof error === 'object') return error as Record<string, unknown>;
  return { value: String(error) };
}

async function writeServerLog(
  supabase: SupabaseClient,
  level: ServerLogLevel,
  message: string,
  details?: Record<string, unknown>
): Promise<void> {
  const payload = {
    level,
    category: 'CampaignDispatch',
    message,
    details: details ?? null,
  };

  try {
    const { error } = await supabase.from('system_logs').insert([payload]);
    if (error) {
      console.error('[campaigns/start] failed to persist system log', error.message, payload);
    }
  } catch (error) {
    console.error('[campaigns/start] exception persisting system log', error, payload);
  }
}

async function getN8nWebhookUrl(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase
    .from('app_settings')
    .select('setting_key, setting_value')
    .in('setting_key', ['n8n_webhook_url', 'n8n_webhook_vapi', 'webhook_url']);

  return (
    data?.find((r: any) => r.setting_key === 'n8n_webhook_vapi')?.setting_value ||
    data?.find((r: any) => r.setting_key === 'n8n_webhook_url')?.setting_value ||
    data?.find((r: any) => r.setting_key === 'webhook_url')?.setting_value ||
    'https://n8n-n8n-start.xzz0ed.easypanel.host/webhook/callcenteria'
  );
}

async function getBackendPublicUrl(supabase: SupabaseClient): Promise<string> {
  const keys = ['backend_public_url', 'backend_url', 'public_base_url', 'public_url'];
  const { data } = await supabase
    .from('app_settings')
    .select('setting_key, setting_value')
    .in('setting_key', keys);

  for (const key of keys) {
    const val = data?.find((r: any) => r.setting_key === key)?.setting_value?.trim().replace(/\/+$/, '');
    if (val) {
      try { new URL(val); return val; } catch {}
    }
  }

  const fromEnv = (
    process.env.BACKEND_PUBLIC_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
  ).replace(/\/+$/, '');

  return fromEnv || 'http://localhost:4000';
}

async function createQueuedCallRecord(
  supabase: SupabaseClient,
  input: {
    campaignContactId: string;
    customerNumber: string;
    campaignName: string;
    customerCpf: string | null;
    customerName: string;
    assistantId: string | null;
    phoneNumberId: string | null;
  }
): Promise<{ id: string | null; error?: string }> {
  const { data, error } = await supabase.from('calls').insert({
    campaign_contact_id: input.campaignContactId,
    contact_phone_id: null,
    customer_number: input.customerNumber,
    campanha: input.campaignName,
    cpf: input.customerCpf,
    cliente: input.customerName,
    assistant_id: input.assistantId,
    phone_number_id: input.phoneNumberId,
    status: 'queued',
  }).select('id').maybeSingle();

  if (error) {
    return { id: null, error: error.message };
  }

  return { id: data?.id ?? null };
}

// ---------------------------------------------------------------------------
// activeCampaignRuns — previne execuções simultâneas da mesma campanha
// ---------------------------------------------------------------------------
const activeCampaignRuns = new Set<string>();

// ---------------------------------------------------------------------------
// Core execution
// ---------------------------------------------------------------------------
type ProcessResult = { contactId: string; contactName: string; success: boolean; error?: string };

async function executeCampaignStart(campaignId: string): Promise<{ totalProcessed: number; successful: number; failed: number }> {
  const supabase = getSupabaseAdmin();
  const runtimeDetails = {
    campaignId,
    vercelUrl: process.env.VERCEL_URL || null,
    vercelRegion: process.env.VERCEL_REGION || null,
    backendPublicUrlEnv: process.env.BACKEND_PUBLIC_URL || null,
  };

  await writeServerLog(supabase, 'info', 'Campaign dispatch background started', runtimeDetails);

  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns').select('*').eq('id', campaignId).single();
  if (campaignError || !campaign) throw new Error('Campanha não encontrada');
  if (!campaign.ativa) throw new Error('Campanha não está ativa');

  await writeServerLog(supabase, 'info', 'Campaign loaded for dispatch', {
    campaignId,
    campaignName: campaign.nome ?? null,
    tipoTelefonia: campaign.tipo_telefonia ?? null,
    ativa: Boolean(campaign.ativa),
    ignoreHorario: Boolean(campaign.ignore_horario),
  });

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

  // Paginação: busca todos os contatos pendentes em páginas de 1000
  const campaignContacts: any[] = [];
  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('campaign_contacts')
      .select(`id, tentativas_realizadas, ultima_tentativa, status, contact_id,
        contacts ( id, nome, cpf, instituicao, telefone )`)
      .eq('campaign_id', campaignId)
      .eq('status', 'pendente')
      .range(from, from + SUPABASE_PAGE_SIZE - 1);

    if (error) throw new Error(`Erro ao buscar contatos: ${error.message}`);
    if (!data || data.length === 0) break;
    campaignContacts.push(...data);
    if (data.length < SUPABASE_PAGE_SIZE) break;
  }

  if (campaignContacts.length === 0) {
    await writeServerLog(supabase, 'warn', 'No pending campaign contacts found', { campaignId });
    return { totalProcessed: 0, successful: 0, failed: 0 };
  }

  const now = new Date();
  const eligibleContacts = campaignContacts.filter((cc: any) => {
    if ((cc.tentativas_realizadas || 0) >= campaign.max_tentativas) return false;
    if (cc.ultima_tentativa) {
      const minutes = (now.getTime() - new Date(cc.ultima_tentativa).getTime()) / (1000 * 60);
      if (minutes < campaign.intervalo_minutos) return false;
    }
    return true;
  });

  if (eligibleContacts.length === 0) {
    await writeServerLog(supabase, 'warn', 'No eligible campaign contacts after filtering', {
      campaignId,
      pendingCount: campaignContacts.length,
    });
    return { totalProcessed: 0, successful: 0, failed: 0 };
  }

  const n8nWebhookUrl = await getN8nWebhookUrl(supabase);
  const backendPublicUrl = await getBackendPublicUrl(supabase);
  const callbackUrl = `${backendPublicUrl}/api/webhooks/vapi/callback`;
  const pacer = new RequestPacer();
  const campaignConcurrency = Math.max(1, Number(campaign.ligacoes_simultaneas) || 1);
  const effectiveConcurrency = Math.min(cfg.maxConcurrency, campaignConcurrency);

  await writeServerLog(supabase, 'info', 'Dispatch prerequisites resolved', {
    campaignId,
    pendingCount: campaignContacts.length,
    eligibleCount: eligibleContacts.length,
    n8nWebhookUrl,
    callbackUrl,
    maxConcurrency: cfg.maxConcurrency,
    campaignConcurrency,
    effectiveConcurrency,
    batchSize: cfg.batchSize,
    requestIntervalMs: cfg.requestIntervalMs,
    pauseMs: cfg.pauseMs,
  });

  console.log(
    `[campaigns/start] iniciando ${eligibleContacts.length} contatos ` +
    `concorrencia=${effectiveConcurrency} batchSize=${cfg.batchSize} ` +
    `requestIntervalMs=${cfg.requestIntervalMs} pauseMs=${cfg.pauseMs}`
  );

  const processContact = async (cc: any, lineIndex: number): Promise<ProcessResult> => {
    const contact = Array.isArray(cc.contacts) ? cc.contacts[0] : cc.contacts;
    const phoneNumber = contact?.telefone ?? null;

    if (!phoneNumber || !contact) {
      return { contactId: contact?.id || cc.contact_id, contactName: contact?.nome || 'Desconhecido', success: false, error: 'Sem telefone' };
    }

    try {
      const linhaVapiId = campaign.tipo_telefonia === 'vapi' ? vapiLines[lineIndex % vapiLines.length] : null;
      const phoneNumberId = linhaVapiId || String(campaign.linha_vapi_id || '').split(',')[0];

      const queuedCall = await createQueuedCallRecord(supabase, {
        campaignContactId: cc.id,
        customerNumber: phoneNumber,
        campaignName: campaign.nome,
        customerCpf: contact.cpf ?? null,
        customerName: contact.nome,
        assistantId: campaign.assistant_vapi_id ?? null,
        phoneNumberId,
      });

      if (queuedCall.error) {
        await writeServerLog(supabase, 'warn', 'Failed to insert queued call record', {
          campaignId,
          campaignContactId: cc.id,
          contactId: contact.id,
          phoneNumber,
          error: queuedCall.error,
        });
      }

      const result = await postWebhookWithRetries(n8nWebhookUrl, {
        contactId: contact.id,
        campaignContactId: cc.id,
        phoneId: null,
        campaignId: campaign.id,
        customerNumber: phoneNumber,
        customerName: contact.nome,
        cpf: contact.cpf,
        customerCpf: contact.cpf,
        assistantId: campaign.assistant_vapi_id,
        phoneNumberId,
        callbackUrl,
        tipoTelefonia: campaign.tipo_telefonia,
      }, pacer);

      if (!result.ok) throw new Error(result.error);

      const { error: updateError } = await supabase.from('campaign_contacts').update({
        status: 'em_andamento',
        tentativas_realizadas: (cc.tentativas_realizadas || 0) + 1,
        ultima_tentativa: new Date().toISOString(),
      }).eq('id', cc.id);

      if (updateError) {
        await writeServerLog(supabase, 'warn', 'Failed to update campaign contact after dispatch', {
          campaignId,
          campaignContactId: cc.id,
          contactId: contact.id,
          error: updateError.message,
        });
      }

      return { contactId: contact.id, contactName: contact.nome, success: true };
    } catch (e: any) {
      return { contactId: contact.id, contactName: contact.nome, success: false, error: e.message };
    }
  };

  const allResults: ProcessResult[] = [];
  for (let i = 0; i < eligibleContacts.length; i += cfg.batchSize) {
    const batch = eligibleContacts.slice(i, i + cfg.batchSize);
    const batchResult = await processWithConcurrency(batch, effectiveConcurrency, (c: any, idx: number) => processContact(c, i + idx));
    allResults.push(...batchResult);

    const ok = allResults.filter((r) => r.success).length;
    console.log(`[campaigns/start] lote: processados=${allResults.length} sucesso=${ok} falhas=${allResults.length - ok}`);

    const failedSamples = batchResult
      .filter((result) => !result.success)
      .slice(0, 5)
      .map((result) => ({
        contactId: result.contactId,
        contactName: result.contactName,
        error: result.error ?? null,
      }));

    await writeServerLog(supabase, failedSamples.length > 0 ? 'warn' : 'info', 'Campaign dispatch batch finished', {
      campaignId,
      processed: allResults.length,
      successful: ok,
      failed: allResults.length - ok,
      failedSamples,
    });

    const hasMore = i + cfg.batchSize < eligibleContacts.length;
    if (hasMore && cfg.pauseMs > 0) {
      console.log(`[campaigns/start] pausando ${cfg.pauseMs}ms antes do próximo lote`);
      await sleep(cfg.pauseMs);
    }
  }

  const summary = {
    totalProcessed: allResults.length,
    successful: allResults.filter((r) => r.success).length,
    failed: allResults.filter((r) => !r.success).length,
  };

  await writeServerLog(supabase, summary.failed > 0 ? 'warn' : 'success', 'Campaign dispatch finished', {
    campaignId,
    ...summary,
  });

  return summary;
}

// ---------------------------------------------------------------------------
// Vercel handler — retorna 202 imediatamente e processa em background
// ---------------------------------------------------------------------------
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Método não permitido' });

  const { campaignId } = req.body as { campaignId?: string };
  const supabase = getSupabaseAdmin();

  if (!campaignId) return res.status(400).json({ success: false, error: 'campaignId obrigatorio' });

  if (activeCampaignRuns.has(campaignId)) {
    return res.status(409).json({ success: false, error: 'Já existe uma execução em andamento para esta campanha' });
  }

  activeCampaignRuns.add(campaignId);

  await writeServerLog(supabase, 'info', 'Campaign start request accepted', {
    campaignId,
    method: req.method,
    hasBody: Boolean(req.body),
    vercelUrl: process.env.VERCEL_URL || null,
    vercelRegion: process.env.VERCEL_REGION || null,
  });

  const backgroundRun = (async () => {
    try {
      const summary = await executeCampaignStart(campaignId);
      console.log(`[campaigns/start] concluído campaign=${campaignId} processados=${summary.totalProcessed} sucesso=${summary.successful} falhas=${summary.failed}`);
    } catch (e: any) {
      console.error('[campaigns/start] background error', e);
      await writeServerLog(supabase, 'error', 'Campaign dispatch background error', {
        campaignId,
        error: serializeError(e),
      });
    } finally {
      activeCampaignRuns.delete(campaignId);
    }
  })();

  // No Vercel, trabalho assíncrono solto pode ser encerrado após a resposta.
  waitUntil(backgroundRun);

  return res.status(202).json({
    success: true,
    message: 'Processamento iniciado em background',
    campaignId,
  });
}
