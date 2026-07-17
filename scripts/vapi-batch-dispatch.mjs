import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';

const DEFAULTS = {
  nameColumn: 'nome',
  cpfColumn: 'cpf',
  phoneColumn: 'telefone',
  institutionColumn: 'instituicao',
  countryCode: '55',
  maxConcurrency: 6,
  batchSize: 500,
  pauseMs: 90_000,
  requestIntervalMs: 250,
  maxRetries: 5,
  retryBaseMs: 2_000,
  retryMaxMs: 30_000,
  stateDir: path.resolve(process.cwd(), 'artifacts', 'dispatch'),
  backendPublicUrl: 'http://localhost:4000',
  referenceResultsDir: path.join(os.homedir(), 'Desktop', 'Projetos', 'requisicao_teste', 'data')
};

const SUCCESS_PARAMS_FILENAME = 'successful_backend_params.json';
const SUCCESS_PARAMS_LOG_FILENAME = 'successful_backend_params.jsonl';
const RESULTS_PREFIX = 'backend_dispatch_results_';
const CONTACT_CHUNK_SIZE = 300;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class RequestPacer {
  constructor() {
    this.nextAllowedAt = 0;
    this.queue = Promise.resolve();
  }

  async waitTurn(minIntervalMs) {
    if (minIntervalMs <= 0) {
      return;
    }

    let delay = 0;
    const reservation = this.queue.then(() => {
      const now = Date.now();
      const scheduledAt = Math.max(now, this.nextAllowedAt);
      this.nextAllowedAt = scheduledAt + minIntervalMs;
      delay = scheduledAt - now;
    });

    this.queue = reservation.catch(() => undefined);
    await reservation;

    if (delay > 0) {
      await sleep(delay);
    }
  }
}

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const [rawKey, inlineValue] = token.slice(2).split('=');
    const key = rawKey.trim();
    if (!key) {
      continue;
    }

    if (inlineValue !== undefined) {
      parsed[key] = inlineValue;
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      parsed[key] = true;
      continue;
    }

    parsed[key] = next;
    index += 1;
  }

  return parsed;
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const entries = {};

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex < 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    entries[key] = value;
  }

  return entries;
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function toInt(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Valor inteiro invalido: ${value}`);
  }

  return parsed;
}

function resolvePath(value) {
  if (!value) {
    return value;
  }

  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(os.homedir(), value.slice(2));
  }

  if (value === '~') {
    return os.homedir();
  }

  return path.resolve(value);
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/gu, '-');
}

function jsonlAppend(filePath, record) {
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function normalizeCustomerName(name) {
  return String(name || '').replace(/\s+/gu, ' ').trim().slice(0, 120);
}

function digitsOnly(value) {
  return String(value || '').replace(/\D+/gu, '');
}

function normalizePhoneNumber(phone, countryCode) {
  const raw = String(phone || '').trim();
  const digits = digitsOnly(raw);

  if (!digits) {
    return '';
  }

  let candidate = '';
  if (raw.startsWith('+')) {
    candidate = `+${digits}`;
  } else if (digits.startsWith(countryCode)) {
    candidate = `+${digits}`;
  } else {
    candidate = `+${countryCode}${digits}`;
  }

  if (!isValidE164(candidate)) {
    return '';
  }

  if (countryCode === '55' && candidate.startsWith('+55')) {
    const nationalNumber = candidate.slice(3);
    if (!isValidBrazilNumber(nationalNumber)) {
      return '';
    }
  }

  return candidate;
}

function isValidE164(number) {
  if (!number.startsWith('+')) {
    return false;
  }

  const digits = number.slice(1);
  if (!/^\d+$/u.test(digits)) {
    return false;
  }

  if (digits.length < 8 || digits.length > 15) {
    return false;
  }

  return !digits.startsWith('0');
}

function isValidBrazilNumber(nationalNumber) {
  if (!/^\d+$/u.test(nationalNumber)) {
    return false;
  }

  if (nationalNumber.length === 10) {
    return '2345'.includes(nationalNumber.slice(2, 3));
  }

  if (nationalNumber.length === 11) {
    return nationalNumber.slice(2, 3) === '9';
  }

  return false;
}

function parseRetryAfterMs(headerValue) {
  if (!headerValue) {
    return null;
  }

  const asSeconds = Number.parseFloat(headerValue);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.round(asSeconds * 1000);
  }

  const parsedDate = Date.parse(headerValue);
  if (Number.isNaN(parsedDate)) {
    return null;
  }

  return Math.max(0, parsedDate - Date.now());
}

function computeBackoffMs(attempt, retryAfterMs, config) {
  if (retryAfterMs !== null) {
    return Math.min(config.retryMaxMs, retryAfterMs);
  }

  const exponentialDelay = config.retryBaseMs * (2 ** attempt);
  const jitter = Math.floor(Math.random() * Math.max(1, config.retryBaseMs));
  return Math.min(config.retryMaxMs, exponentialDelay + jitter);
}

function shuffleArray(array) {
  const shuffled = [...array];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const otherIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[otherIndex]] = [shuffled[otherIndex], shuffled[index]];
  }
  return shuffled;
}

async function processWithConcurrency(items, concurrency, handler) {
  if (items.length === 0) {
    return [];
  }

  const results = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const currentIndex = nextIndex;
        nextIndex += 1;

        if (currentIndex >= items.length) {
          return;
        }

        results[currentIndex] = await handler(items[currentIndex], currentIndex);
      }
    })
  );

  return results;
}

function readWorkbookRows(excelPath) {
  const workbook = XLSX.readFile(excelPath, { cellDates: false });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    return [];
  }

  return XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
    defval: '',
    raw: false
  });
}

function sanitizeHeaders(rows) {
  return rows.map((row) => {
    const normalized = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[String(key).trim()] = value;
    }
    return normalized;
  });
}

function collectContactsFromRows(rows, config) {
  const contacts = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const telefone = normalizePhoneNumber(row[config.phoneColumn], config.countryCode);

    if (!telefone) {
      console.log(`[linha ${rowNumber}] ignorada: telefone vazio ou invalido`);
      return;
    }

    contacts.push({
      rowNumber,
      nome: normalizeCustomerName(row[config.nameColumn]),
      cpf: digitsOnly(row[config.cpfColumn]),
      telefone,
      instituicao: normalizeCustomerName(row[config.institutionColumn] || ''),
      phoneId: null
    });
  });

  if (config.rowLimit !== null) {
    return contacts.slice(0, config.rowLimit);
  }

  return contacts;
}

function extractSuccessfulParamsFromFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const entries = [];

  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      const record = JSON.parse(trimmed);
      if (!record?.result?.ok || !record?.payload) {
        continue;
      }

      const assistantId = nonEmpty(record.payload.assistantId);
      const phoneNumberId = nonEmpty(record.payload.phoneNumberId);
      if (!assistantId || !phoneNumberId) {
        continue;
      }

      entries.push({
        assistantId,
        phoneNumberId,
        source: `reference:${path.basename(filePath)}`
      });
    } catch {
      continue;
    }
  }

  return entries;
}

function collectReferenceCandidates(referenceResultsDir) {
  if (!fs.existsSync(referenceResultsDir)) {
    return [];
  }

  const files = fs
    .readdirSync(referenceResultsDir)
    .filter((fileName) => fileName.toLowerCase().endsWith('.jsonl'))
    .map((fileName) => {
      const filePath = path.join(referenceResultsDir, fileName);
      return {
        filePath,
        mtimeMs: fs.statSync(filePath).mtimeMs
      };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  const found = [];
  const seen = new Set();

  for (const file of files) {
    for (const candidate of extractSuccessfulParamsFromFile(file.filePath)) {
      const key = `${candidate.assistantId}::${candidate.phoneNumberId}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      found.push(candidate);
    }
  }

  return found;
}

function loadSuccessParamsIndex(filePath) {
  if (!fs.existsSync(filePath)) {
    return { updatedAt: null, entries: [] };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      updatedAt: parsed.updatedAt || null,
      entries: Array.isArray(parsed.entries) ? parsed.entries : []
    };
  } catch {
    return { updatedAt: null, entries: [] };
  }
}

function loadPersistedSuccessParams(filePath) {
  const parsed = loadSuccessParamsIndex(filePath);
  return parsed.entries
    .map((entry) => ({
      assistantId: nonEmpty(entry.assistantId),
      phoneNumberId: nonEmpty(entry.phoneNumberId),
      source: 'persisted',
      successCount: Number(entry.successCount || 0),
      lastSuccessAt: entry.lastSuccessAt || null
    }))
    .filter((entry) => entry.assistantId && entry.phoneNumberId);
}

function createSupabaseAdmin(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });
}

async function resolveTemplateCampaign(config, supabaseAdmin) {
  if (config.templateCampaignId) {
    const { data, error } = await supabaseAdmin
      .from('campaigns')
      .select('*')
      .eq('id', config.templateCampaignId)
      .maybeSingle();

    if (error || !data) {
      throw new Error(`Campanha modelo nao encontrada: ${config.templateCampaignId}`);
    }

    return data;
  }

  const { data, error } = await supabaseAdmin
    .from('campaigns')
    .select('*')
    .eq('tipo_telefonia', 'vapi')
    .eq('ativa', true)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Erro ao buscar campanhas: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error('Nenhuma campanha VAPI ativa encontrada para usar como modelo.');
  }

  const persisted = loadPersistedSuccessParams(config.successParamsFilePath).sort((left, right) => {
    const successDelta = (right.successCount || 0) - (left.successCount || 0);
    if (successDelta !== 0) {
      return successDelta;
    }

    return String(right.lastSuccessAt || '').localeCompare(String(left.lastSuccessAt || ''));
  });
  const references = collectReferenceCandidates(config.referenceResultsDir);
  const candidates = [...persisted, ...references];

  for (const candidate of candidates) {
    const match = data.find((campaign) => {
      const lines = String(campaign.linha_vapi_id || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

      return campaign.assistant_vapi_id === candidate.assistantId && lines.includes(candidate.phoneNumberId);
    });

    if (match) {
      return match;
    }
  }

  return data[0];
}

async function loadCampaignById(supabaseAdmin, campaignId) {
  const { data, error } = await supabaseAdmin.from('campaigns').select('*').eq('id', campaignId).maybeSingle();
  if (error || !data) {
    throw new Error(`Campanha nao encontrada: ${campaignId}`);
  }

  return data;
}

async function createDispatchCampaign(config, supabaseAdmin, templateCampaign) {
  const fileName = path.basename(config.excelPath);
  const payload = {
    nome: `Dispatch ${fileName} ${new Date().toISOString()}`,
    instituicao: templateCampaign.instituicao || 'Importacao XLSX',
    tipo_telefonia: 'vapi',
    ativa: true,
    assistant_vapi_id: templateCampaign.assistant_vapi_id,
    linha_vapi_id: templateCampaign.linha_vapi_id,
    max_tentativas: templateCampaign.max_tentativas || 1,
    intervalo_minutos: templateCampaign.intervalo_minutos || 0,
    janela_inicio: templateCampaign.janela_inicio || null,
    janela_fim: templateCampaign.janela_fim || null,
    descricao: `Criada automaticamente para disparo do arquivo ${fileName}. Modelo: ${templateCampaign.nome}`,
    ligacoes_simultaneas: templateCampaign.ligacoes_simultaneas || config.maxConcurrency,
    ignore_horario: true
  };

  const { data, error } = await supabaseAdmin.from('campaigns').insert(payload).select('*').single();

  if (error || !data) {
    throw new Error(`Erro ao criar campanha temporaria: ${error?.message || 'sem retorno'}`);
  }

  return data;
}

async function importContactsIntoCampaign(supabaseAdmin, campaignId, contacts) {
  const contactsPayload = contacts.map((contact) => ({
    nome: contact.nome || null,
    cpf: contact.cpf || null,
    instituicao: contact.instituicao || null,
    telefone: contact.telefone
  }));

  const allPhones = contactsPayload.map((contact) => contact.telefone);
  const phoneChunks = chunkArray(allPhones, CONTACT_CHUNK_SIZE);
  const existingPhoneMap = new Map();

  for (const chunk of phoneChunks) {
    const { data, error } = await supabaseAdmin.from('contacts').select('id, telefone').in('telefone', chunk);
    if (error) {
      throw new Error(`Erro ao buscar contatos existentes: ${error.message}`);
    }

    data?.forEach((contact) => existingPhoneMap.set(contact.telefone, contact.id));
  }

  const newContacts = contactsPayload.filter((contact) => !existingPhoneMap.has(contact.telefone));
  const insertChunks = chunkArray(newContacts, CONTACT_CHUNK_SIZE);

  for (const chunk of insertChunks) {
    if (chunk.length === 0) {
      continue;
    }

    const { data, error } = await supabaseAdmin.from('contacts').insert(chunk).select('id, telefone');
    if (error) {
      throw new Error(`Erro ao inserir novos contatos: ${error.message}`);
    }

    data?.forEach((contact) => existingPhoneMap.set(contact.telefone, contact.id));
  }

  const campaignPayload = [];
  const processedIds = new Set();

  for (const contact of contactsPayload) {
    const contactId = existingPhoneMap.get(contact.telefone);
    if (!contactId || processedIds.has(contactId)) {
      continue;
    }

    campaignPayload.push({
      campaign_id: campaignId,
      contact_id: contactId,
      status: 'pendente',
      tentativas: 0
    });
    processedIds.add(contactId);
  }

  const linkChunks = chunkArray(campaignPayload, CONTACT_CHUNK_SIZE);
  for (const chunk of linkChunks) {
    if (chunk.length === 0) {
      continue;
    }

    const { error: upsertError } = await supabaseAdmin
      .from('campaign_contacts')
      .upsert(chunk, { onConflict: 'campaign_id,contact_id', ignoreDuplicates: true });

    if (upsertError) {
      const { error: insertError } = await supabaseAdmin.from('campaign_contacts').insert(chunk);
      if (insertError && !String(insertError.message || '').includes('duplicate')) {
        throw new Error(`Erro ao vincular contatos na campanha: ${insertError.message}`);
      }
    }
  }

  return {
    totalReceived: contacts.length,
    newContacts: newContacts.length,
    linkedContacts: campaignPayload.length
  };
}

async function loadN8nWebhookUrl(supabaseAdmin) {
  const { data } = await supabaseAdmin
    .from('app_settings')
    .select('setting_key, setting_value')
    .in('setting_key', ['n8n_webhook_url', 'n8n_webhook_vapi', 'webhook_url']);

  return (
    data?.find((item) => item.setting_key === 'n8n_webhook_url')?.setting_value ||
    data?.find((item) => item.setting_key === 'n8n_webhook_vapi')?.setting_value ||
    data?.find((item) => item.setting_key === 'webhook_url')?.setting_value ||
    'https://n8n-n8n-start.xzz0ed.easypanel.host/webhook/callcenteria'
  );
}

async function postWebhookWithRetries(url, payload, config, pacer) {
  const attempts = Math.max(1, config.maxRetries + 1);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await pacer.waitTurn(config.requestIntervalMs);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-source': 'node-backend',
        'x-function-name': 'initiate-vapi-call',
        'x-system': 'discador-vapi',
        'x-version': '1.0'
      },
      body: JSON.stringify(payload)
    });

    const rawBody = await response.text();
    let parsedBody = null;

    if (rawBody) {
      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        parsedBody = rawBody;
      }
    }

    const explicitFailure =
      parsedBody &&
      typeof parsedBody === 'object' &&
      (parsedBody.success === false ||
        parsedBody.ok === false ||
        parsedBody.executed === false ||
        Boolean(parsedBody.error));

    if (response.ok && !explicitFailure) {
      return {
        ok: true,
        status_code: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        response: parsedBody
      };
    }

    if (response.status === 429 && attempt < attempts - 1) {
      const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
      await sleep(computeBackoffMs(attempt, retryAfterMs, config));
      continue;
    }

    return {
      ok: false,
      status_code: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      error:
        (explicitFailure && (parsedBody.error || parsedBody.message)) ||
        parsedBody ||
        `Erro n8n: ${response.status} ${response.statusText}`
    };
  }

  return {
    ok: false,
    status_code: null,
    headers: {},
    error: 'Fluxo de retry encerrado sem retorno'
  };
}

async function collectCampaignRowsToProcess(supabaseAdmin, campaign) {
  const campaignContacts = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('campaign_contacts')
      .select(
        `
          id,
          tentativas_realizadas,
          ultima_tentativa,
          status,
          contact_id,
          contacts (
            id,
            nome,
            cpf,
            instituicao,
            telefone
          )
        `
      )
      .eq('campaign_id', campaign.id)
      .in('status', ['pendente', 'em_andamento'])
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`Erro ao buscar contatos da campanha: ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    campaignContacts.push(...data);
    if (data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  const now = new Date();
  const eligibleCampaignContacts = campaignContacts.filter((item) => {
    if ((item.tentativas_realizadas || 0) >= (campaign.max_tentativas || 1)) {
      return false;
    }

    if (item.ultima_tentativa && campaign.intervalo_minutos) {
      const minutes = (now.getTime() - new Date(item.ultima_tentativa).getTime()) / (1000 * 60);
      if (minutes < campaign.intervalo_minutos) {
        return false;
      }
    }

    return true;
  });

  return eligibleCampaignContacts.map((entry) => {
    const contact = Array.isArray(entry.contacts) ? entry.contacts[0] : entry.contacts;
    const phoneNumber = contact?.telefone || '';

    return {
      campaignContactId: entry.id,
      tentativasRealizadas: entry.tentativas_realizadas || 0,
      contactId: contact?.id || entry.contact_id,
      contactName: contact?.nome || 'Desconhecido',
      customerCpf: contact?.cpf || '',
      customerNumber: phoneNumber,
      phoneId: null
    };
  });
}

async function markCampaignContactInProgress(supabaseAdmin, campaignContactId, tentativasRealizadas) {
  const { error } = await supabaseAdmin
    .from('campaign_contacts')
    .update({
      status: 'em_andamento',
      ultima_tentativa: new Date().toISOString(),
      tentativas_realizadas: tentativasRealizadas + 1
    })
    .eq('id', campaignContactId);

  if (error) {
    console.warn(`[campaign_contacts] nao foi possivel atualizar ${campaignContactId}: ${error.message}`);
  }
}

function buildStartPayload(item, campaign, vapiLines, lineIndex, callbackUrl) {
  const linhaVapiId = vapiLines.length > 0 ? vapiLines[lineIndex % vapiLines.length] : null;

  return {
    contactId: item.contactId,
    campaignContactId: item.campaignContactId,
    phoneId: item.phoneId,
    campaignId: campaign.id,
    customerNumber: item.customerNumber,
    customerName: item.contactName,
    cpf: item.customerCpf,
    customerCpf: item.customerCpf,
    assistantId: campaign.assistant_vapi_id,
    phoneNumberId: linhaVapiId || String(campaign.linha_vapi_id || '').split(',')[0],
    callbackUrl,
    tipoTelefonia: 'vapi'
  };
}

function persistSuccessfulParams(config, context) {
  const index = loadSuccessParamsIndex(config.successParamsFilePath);
  const key = `${context.templateCampaignId}::${context.campaignId}`;
  const existingEntries = Array.isArray(index.entries) ? index.entries : [];
  const currentTimestamp = new Date().toISOString();

  let found = false;
  const nextEntries = existingEntries.map((entry) => {
    const entryKey = `${entry.templateCampaignId}::${entry.campaignId}`;
    if (entryKey !== key) {
      return entry;
    }

    found = true;
    return {
      ...entry,
      successCount: Number(entry.successCount || 0) + 1,
      lastSuccessAt: currentTimestamp,
      campaignName: context.campaignName,
      assistantId: context.assistantId,
      phoneNumberIds: context.phoneNumberIds,
      callbackUrl: context.callbackUrl,
      n8nWebhookUrl: context.n8nWebhookUrl
    };
  });

  if (!found) {
    nextEntries.push({
      templateCampaignId: context.templateCampaignId,
      campaignId: context.campaignId,
      campaignName: context.campaignName,
      assistantId: context.assistantId,
      phoneNumberIds: context.phoneNumberIds,
      callbackUrl: context.callbackUrl,
      n8nWebhookUrl: context.n8nWebhookUrl,
      successCount: 1,
      lastSuccessAt: currentTimestamp
    });
  }

  fs.writeFileSync(
    config.successParamsFilePath,
    JSON.stringify(
      {
        updatedAt: currentTimestamp,
        entries: nextEntries.sort((left, right) => Number(right.successCount || 0) - Number(left.successCount || 0))
      },
      null,
      2
    ),
    'utf8'
  );

  jsonlAppend(config.successParamsLogFilePath, {
    timestamp: currentTimestamp,
    templateCampaignId: context.templateCampaignId,
    campaignId: context.campaignId,
    campaignName: context.campaignName,
    assistantId: context.assistantId,
    phoneNumberIds: context.phoneNumberIds,
    rowNumber: context.rowNumber,
    customerNumber: context.customerNumber
  });
}

async function runDispatch(config) {
  const supabaseAdmin = createSupabaseAdmin(config.env);
  const rawRows = sanitizeHeaders(readWorkbookRows(config.excelPath));
  let templateCampaign;
  let dispatchCampaign;

  if (config.existingCampaignId) {
    dispatchCampaign = await loadCampaignById(supabaseAdmin, config.existingCampaignId);
    templateCampaign = config.templateCampaignId
      ? await loadCampaignById(supabaseAdmin, config.templateCampaignId)
      : dispatchCampaign;

    console.log(`Retomando campanha existente: ${dispatchCampaign.nome} (${dispatchCampaign.id})`);
  } else {
    const contacts = collectContactsFromRows(rawRows, config);
    if (contacts.length === 0) {
      throw new Error('Nenhuma linha valida encontrada para envio.');
    }

    templateCampaign = await resolveTemplateCampaign(config, supabaseAdmin);
    console.log(
      `Campanha modelo: ${templateCampaign.nome} (${templateCampaign.id}) assistant=${templateCampaign.assistant_vapi_id} linhas=${templateCampaign.linha_vapi_id}`
    );

    if (config.dryRun) {
      console.log(`Dry-run: ${contacts.length} contatos preparados para importacao.`);
      for (const item of contacts.slice(0, 5)) {
        console.log(JSON.stringify(item, null, 2));
      }
      return;
    }

    dispatchCampaign = await createDispatchCampaign(config, supabaseAdmin, templateCampaign);
    console.log(`Campanha temporaria criada: ${dispatchCampaign.nome} (${dispatchCampaign.id})`);

    fs.mkdirSync(config.stateDir, { recursive: true });

    const importSummary = await importContactsIntoCampaign(supabaseAdmin, dispatchCampaign.id, contacts);
    console.log(
      `Importacao concluida: recebidos=${importSummary.totalReceived} novos=${importSummary.newContacts} vinculados=${importSummary.linkedContacts}`
    );
  }

  fs.mkdirSync(config.stateDir, { recursive: true });

  const n8nWebhookUrl = await loadN8nWebhookUrl(supabaseAdmin);
  const callbackUrl = `${config.backendPublicUrl}/api/webhooks/vapi/callback`;
  const rowsToProcess = await collectCampaignRowsToProcess(supabaseAdmin, dispatchCampaign);
  const pacer = new RequestPacer();
  const vapiLines = shuffleArray(String(dispatchCampaign.linha_vapi_id || '').split(',').filter(Boolean));

  console.log(
    `Iniciando disparo backend-aware: contatos=${rowsToProcess.length} concorrencia=${config.maxConcurrency} batchSize=${config.batchSize} intervalMs=${config.requestIntervalMs}`
  );

  let successCount = 0;
  let failureCount = 0;
  const batches = chunkArray(rowsToProcess, config.batchSize);

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batch = batches[batchIndex];
    console.log(`Lote ${batchIndex + 1}/${batches.length}: enviando ${batch.length} requisicoes...`);

    await processWithConcurrency(batch, config.maxConcurrency, async (item, index) => {
      if (!item.customerNumber) {
        failureCount += 1;
        console.log(`[contact ${item.contactId}] ERRO sem telefone`);
        return;
      }

      const payload = buildStartPayload(
        item,
        dispatchCampaign,
        vapiLines,
        batchIndex * config.batchSize + index,
        callbackUrl
      );
      const result = await postWebhookWithRetries(n8nWebhookUrl, payload, config, pacer);

      jsonlAppend(config.runResultsFilePath, {
        campaign_id: dispatchCampaign.id,
        campaign_name: dispatchCampaign.nome,
        template_campaign_id: templateCampaign.id,
        contact_id: item.contactId,
        campaign_contact_id: item.campaignContactId,
        customer_name: item.contactName,
        customer_number: item.customerNumber,
        request_name: `campaign-contact-${item.campaignContactId}`,
        payload,
        result
      });

      if (result.ok) {
        successCount += 1;
        await markCampaignContactInProgress(
          supabaseAdmin,
          item.campaignContactId,
          item.tentativasRealizadas
        );
        persistSuccessfulParams(config, {
          templateCampaignId: templateCampaign.id,
          campaignId: dispatchCampaign.id,
          campaignName: dispatchCampaign.nome,
          assistantId: dispatchCampaign.assistant_vapi_id,
          phoneNumberIds: dispatchCampaign.linha_vapi_id,
          callbackUrl,
          n8nWebhookUrl,
          rowNumber: item.campaignContactId,
          customerNumber: item.customerNumber
        });
      } else {
        failureCount += 1;
      }

      console.log(
        `[contact ${item.contactId}] ${result.ok ? 'OK' : 'ERRO'} status=${result.status_code} telefone=${item.customerNumber}`
      );
    });

    console.log(`Lote ${batchIndex + 1} finalizado: sucesso=${successCount} falhas=${failureCount}`);

    if (batchIndex < batches.length - 1 && config.pauseMs > 0) {
      console.log(`Aguardando ${config.pauseMs} ms antes do proximo lote...`);
      await sleep(config.pauseMs);
    }
  }

  console.log(
    `Processamento concluido. campanha=${dispatchCampaign.id} sucesso=${successCount} falhas=${failureCount} resultados=${config.runResultsFilePath}`
  );
  console.log(`Parametros bem sucedidos persistidos em ${config.successParamsFilePath}`);
}

function buildConfig() {
  const args = parseArgs(process.argv.slice(2));
  const env = readEnvFile(path.resolve(process.cwd(), '.env'));
  const excelPath = resolvePath(args['excel-path']);

  if (!excelPath) {
    throw new Error('Informe --excel-path com o arquivo .xlsx de entrada.');
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios no .env.');
  }

  const stateDir = resolvePath(args['state-dir'] || env.VAPI_BATCH_STATE_DIR || DEFAULTS.stateDir);

  return {
    excelPath,
    env,
    templateCampaignId: nonEmpty(args['template-campaign-id']),
    existingCampaignId: nonEmpty(args['existing-campaign-id']),
    nameColumn: nonEmpty(args['name-column']) || DEFAULTS.nameColumn,
    cpfColumn: nonEmpty(args['cpf-column']) || DEFAULTS.cpfColumn,
    phoneColumn: nonEmpty(args['phone-column']) || DEFAULTS.phoneColumn,
    institutionColumn: nonEmpty(args['institution-column']) || DEFAULTS.institutionColumn,
    countryCode: nonEmpty(args['country-code']) || DEFAULTS.countryCode,
    maxConcurrency: Math.max(1, toInt(args['max-concurrency'], DEFAULTS.maxConcurrency)),
    batchSize: Math.max(1, toInt(args['batch-size'], DEFAULTS.batchSize)),
    pauseMs: Math.max(0, toInt(args['pause-ms'], DEFAULTS.pauseMs)),
    requestIntervalMs: Math.max(0, toInt(args['request-interval-ms'], DEFAULTS.requestIntervalMs)),
    maxRetries: Math.max(0, toInt(args['max-retries'], DEFAULTS.maxRetries)),
    retryBaseMs: Math.max(0, toInt(args['retry-base-ms'], DEFAULTS.retryBaseMs)),
    retryMaxMs: Math.max(0, toInt(args['retry-max-ms'], DEFAULTS.retryMaxMs)),
    rowLimit: args['row-limit'] !== undefined ? Math.max(0, toInt(args['row-limit'], 0)) : null,
    dryRun: Boolean(args['dry-run']),
    backendPublicUrl:
      nonEmpty(args['backend-public-url']) ||
      nonEmpty(env.BACKEND_PUBLIC_URL) ||
      DEFAULTS.backendPublicUrl,
    stateDir,
    referenceResultsDir: resolvePath(
      args['reference-results-dir'] || env.VAPI_BATCH_REFERENCE_RESULTS_DIR || DEFAULTS.referenceResultsDir
    ),
    successParamsFilePath: path.join(stateDir, SUCCESS_PARAMS_FILENAME),
    successParamsLogFilePath: path.join(stateDir, SUCCESS_PARAMS_LOG_FILENAME),
    runResultsFilePath: path.join(stateDir, `${RESULTS_PREFIX}${nowStamp()}.jsonl`)
  };
}

async function main() {
  const config = buildConfig();

  if (!fs.existsSync(config.excelPath)) {
    throw new Error(`Arquivo Excel nao encontrado: ${config.excelPath}`);
  }

  await runDispatch(config);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
