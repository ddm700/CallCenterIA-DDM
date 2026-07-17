import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';

const DEFAULT_XLSX = path.resolve(process.cwd(), 'acordos_reg', 'acordos_reg.xlsx');
const OUTPUT_DIR = path.resolve(process.cwd(), 'outputs', 'acordos-reg');

function loadEnv() {
  for (const file of ['.env', path.join('backend', '.env')]) {
    if (!fs.existsSync(file)) continue;

    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

function parseArgs(argv) {
  const args = { apply: false, xlsx: DEFAULT_XLSX };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--apply') args.apply = true;
    if (token === '--xlsx') args.xlsx = path.resolve(argv[index + 1] || DEFAULT_XLSX);
  }
  return args;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const str = String(value).trim();
    if (str) return str;
  }
  return '';
}

function normalizeUrl(value) {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

function normalizeCpf(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function dateOnly(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const str = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function nextDate(date) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

function readReferences(xlsxPath) {
  const workbook = XLSX.readFile(xlsxPath, { cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });

  return rows
    .map((row, index) => ({
      rowNumber: index + 2,
      url: firstNonEmpty(row.url, row.URL, row['url '], row.Url),
      data: dateOnly(row.Data || row.data),
      campanha: firstNonEmpty(row.Campanha, row.campanha),
      nome: firstNonEmpty(row.Nome, row['Nome '], row.nome)
    }))
    .filter((row) => row.url && row.data && row.campanha);
}

async function findCallByUrl(supabase, url) {
  const normalized = normalizeUrl(url);
  const { data, error } = await supabase
    .from('calls')
    .select(
      'id, vapi_call_id, assistant_id, campanha, cpf, cliente, customer_number, started_at, recording_url, stereo_recording_url, transcript, summary'
    )
    .or(`recording_url.ilike.%${normalized}%,stereo_recording_url.ilike.%${normalized}%`)
    .order('started_at', { ascending: false })
    .limit(5);

  if (error) throw error;

  return (data || []).find((call) =>
    [call.recording_url, call.stereo_recording_url].some((candidate) => normalizeUrl(candidate).includes(normalized))
  ) || null;
}

async function findExistingAgreement(supabase, reference, call) {
  const cpf = normalizeCpf(call?.cpf);
  const name = normalizeText(firstNonEmpty(call?.cliente, reference.nome));
  const campaign = firstNonEmpty(call?.campanha, reference.campanha);

  if (cpf) {
    const { data, error } = await supabase
      .from('acordos_formalizados')
      .select('*')
      .eq('cpf', cpf)
      .limit(20);
    if (error) throw error;
    const rows = data || [];

    return rows.find((row) => normalizeText(row.campanha) === normalizeText(campaign)) ||
      rows[0] ||
      null;
  }

  const start = `${reference.data}T00:00:00.000Z`;
  const end = `${nextDate(reference.data)}T00:00:00.000Z`;
  const { data, error } = await supabase
    .from('acordos_formalizados')
    .select('*')
    .eq('campanha', campaign)
    .gte('created_at', start)
    .lt('created_at', end)
    .limit(50);
  if (error) throw error;
  const rows = data || [];

  return rows.find((row) => name && normalizeText(row.nome) === name) ||
    rows.find((row) => name && (normalizeText(row.nome).includes(name) || name.includes(normalizeText(row.nome)))) ||
    null;
}

function buildAgreementPayload(reference, call, { includeDefaultValue = false } = {}) {
  const payload = {
    created_at: call?.started_at || `${reference.data}T12:00:00.000Z`,
    campanha: firstNonEmpty(call?.campanha, reference.campanha),
    nome: firstNonEmpty(call?.cliente, reference.nome) || null,
    cpf: normalizeCpf(call?.cpf) || null,
    Instituicao: firstNonEmpty(call?.campanha, reference.campanha) || null
  };

  if (includeDefaultValue) {
    payload.valor_recuperado = 0;
  }

  return payload;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnv();

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY sao obrigatorios.');
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const references = readReferences(args.xlsx);
  const results = [];

  for (const reference of references) {
    const call = await findCallByUrl(supabase, reference.url);
    const existing = call ? await findExistingAgreement(supabase, reference, call) : null;
    const payload = call ? buildAgreementPayload(reference, call, { includeDefaultValue: !existing }) : null;

    let action = 'not_found';
    let writtenId = existing?.id || null;

    if (call && existing) {
      action = args.apply ? 'updated' : 'would_update';
      if (args.apply) {
        const { error } = await supabase.from('acordos_formalizados').update(payload).eq('id', existing.id);
        if (error) throw error;
      }
    } else if (call) {
      action = args.apply ? 'inserted' : 'would_insert';
      if (args.apply) {
        const { data, error } = await supabase.from('acordos_formalizados').insert(payload).select('id').single();
        if (error) throw error;
        writtenId = data?.id || null;
      }
    }

    results.push({
      rowNumber: reference.rowNumber,
      action,
      agreementId: writtenId,
      reference,
      call: call
        ? {
            id: call.id,
            vapi_call_id: call.vapi_call_id,
            cliente: call.cliente,
            cpf: call.cpf,
            telefone: call.customer_number,
            campanha: call.campanha,
            started_at: call.started_at,
            recording_url: call.recording_url
          }
        : null,
      payload
    });
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, `fill-acordos-${args.apply ? 'applied' : 'dry-run'}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

  const summary = results.reduce((acc, result) => {
    acc[result.action] = (acc[result.action] || 0) + 1;
    return acc;
  }, {});

  console.log(JSON.stringify({ apply: args.apply, summary, outputPath }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
