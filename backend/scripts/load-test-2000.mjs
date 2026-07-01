import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readEnvFile(filePath) {
  const entries = {};
  if (!fs.existsSync(filePath)) return entries;
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    entries[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return entries;
}

const env = { ...readEnvFile(path.resolve(__dirname, '../.env')), ...readEnvFile(path.resolve(__dirname, '../../.env')) };

const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const BACKEND_BASE_URL = process.env.LOAD_TEST_BACKEND_URL || 'http://localhost:4100';

const ASSISTANT_ID = '3bb40340-24f3-45af-87fc-162a15eaa7fc'; // JULIA - VEIGA
const PHONE_NUMBER_ID = '992eb80b-c46a-4d61-9087-37ec21c22333'; // New Voice NV (+5521989510033)

const TOTAL_CONTACTS = 2000;
const INSERT_CHUNK_SIZE = 500;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY nao encontrados em backend/.env');
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function fakeCpf(n) {
  return String(1000000000 + n).padStart(11, '0').slice(0, 11);
}

// DDD "00" nao existe no plano de numeracao da ANATEL: o numero e sintaticamente
// valido (11 digitos, formato movel) mas invalido na pratica, entao a operadora/VAPI
// rejeita antes de tocar em qualquer linha real.
function syntheticPhone(n) {
  return `+55009${String(n).padStart(8, '0')}`;
}

async function createCampaign() {
  const nome = `LOAD TEST backend->n8n 2000 ${new Date().toISOString()}`;
  const { data, error } = await supabaseAdmin
    .from('campaigns')
    .insert({
      nome,
      instituicao: 'Teste de carga sintetico',
      descricao: 'Teste de carga backend->n8n com 2000 contatos sinteticos (numeros invalidos, DDD 00).',
      tipo_telefonia: 'vapi',
      assistant_vapi_id: ASSISTANT_ID,
      linha_vapi_id: PHONE_NUMBER_ID,
      max_tentativas: 1,
      intervalo_minutos: 0,
      ativa: true,
      ignore_horario: true,
      ligacoes_simultaneas: 5
    })
    .select('*')
    .single();

  if (error || !data) throw new Error(`Erro ao criar campanha de teste: ${error?.message}`);
  return data;
}

async function createSyntheticContacts(campaignId) {
  const contactsPayload = Array.from({ length: TOTAL_CONTACTS }, (_, i) => ({
    nome: `Teste Sintetico ${i + 1}`,
    cpf: fakeCpf(i + 1),
    instituicao: 'Teste de carga sintetico',
    telefone: syntheticPhone(i + 1)
  }));

  const insertedIds = [];
  for (const batch of chunk(contactsPayload, INSERT_CHUNK_SIZE)) {
    const { data, error } = await supabaseAdmin.from('contacts').insert(batch).select('id');
    if (error) throw new Error(`Erro ao inserir contatos sinteticos: ${error.message}`);
    insertedIds.push(...data.map((row) => row.id));
  }

  const linkPayload = insertedIds.map((contactId) => ({
    campaign_id: campaignId,
    contact_id: contactId,
    status: 'pendente',
    tentativas: 0,
    tentativas_realizadas: 0
  }));

  for (const batch of chunk(linkPayload, INSERT_CHUNK_SIZE)) {
    const { error } = await supabaseAdmin.from('campaign_contacts').insert(batch);
    if (error) throw new Error(`Erro ao vincular contatos a campanha: ${error.message}`);
  }

  return insertedIds.length;
}

async function callStart(campaignId) {
  const response = await fetch(`${BACKEND_BASE_URL}/api/campaigns/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ campaignId })
  });

  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function deactivateCampaign(campaignId) {
  await supabaseAdmin.from('campaigns').update({ ativa: false }).eq('id', campaignId);
}

async function main() {
  console.log(`[load-test] backend alvo: ${BACKEND_BASE_URL}`);
  console.log('[load-test] criando campanha de teste...');
  const campaign = await createCampaign();
  console.log(`[load-test] campanha criada: ${campaign.id} (${campaign.nome})`);

  console.log(`[load-test] gerando ${TOTAL_CONTACTS} contatos sinteticos...`);
  const linked = await createSyntheticContacts(campaign.id);
  console.log(`[load-test] contatos vinculados: ${linked}`);

  const startedAt = Date.now();
  let totalProcessed = 0;
  let totalSuccessful = 0;
  let totalFailed = 0;
  let cycle = 0;
  const sampleErrors = new Map();

  while (true) {
    cycle += 1;
    const cycleStartedAt = Date.now();
    const { status, body } = await callStart(campaign.id);
    const cycleMs = Date.now() - cycleStartedAt;

    if (status !== 200 || !body.success) {
      console.error(`[load-test] ciclo ${cycle} falhou (status=${status}):`, body.error || body);
      break;
    }

    totalProcessed += body.totalProcessed || 0;
    totalSuccessful += body.successful || 0;
    totalFailed += body.failed || 0;

    console.log(
      `[load-test] ciclo ${cycle}: processados=${body.totalProcessed} sucesso=${body.successful} ` +
        `falhas=${body.failed} restantes=${body.remainingPending} duracao=${cycleMs}ms`
    );

    if (body.completed) break;
    if (cycle > 500) {
      console.warn('[load-test] limite de seguranca de ciclos atingido, interrompendo.');
      break;
    }
  }

  const totalMs = Date.now() - startedAt;

  console.log('\n=== RESULTADO DO TESTE DE CARGA ===');
  console.log(`Campanha: ${campaign.id}`);
  console.log(`Total processado: ${totalProcessed}/${TOTAL_CONTACTS}`);
  console.log(`Sucesso (dispatch aceito pelo n8n): ${totalSuccessful}`);
  console.log(`Falha (dispatch rejeitado/erro): ${totalFailed}`);
  console.log(`Tempo total: ${(totalMs / 1000).toFixed(1)}s`);
  console.log(`Vazao media: ${(totalProcessed / (totalMs / 1000)).toFixed(2)} req/s`);

  console.log('\n[load-test] desativando campanha de teste...');
  await deactivateCampaign(campaign.id);
  console.log('[load-test] concluido.');
}

main().catch((error) => {
  console.error('[load-test] erro fatal:', error?.message || error);
  process.exitCode = 1;
});
