import fs from 'node:fs';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  for (const file of ['.env', 'backend/.env']) {
    if (!fs.existsSync(file)) continue;

    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

function parseArgs(argv) {
  return {
    apply: argv.includes('--apply'),
    limit: Number(argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] || 1000)
  };
}

function amount(cost) {
  const value = Number(cost?.amount ?? cost?.cost ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function costItems(meta) {
  if (Array.isArray(meta?.costs)) return meta.costs;
  if (Array.isArray(meta?.call?.costs)) return meta.call.costs;
  if (Array.isArray(meta?.costBreakdown)) return meta.costBreakdown;
  if (Array.isArray(meta?.call?.costBreakdown)) return meta.call.costBreakdown;
  return [];
}

function calculateCosts(meta) {
  const costs = costItems(meta);
  const byType = (types) =>
    costs
      .filter((cost) => types.includes(String(cost?.type || '').toLowerCase()))
      .reduce((sum, cost) => sum + amount(cost), 0);
  const itemTotal = costs.reduce((sum, cost) => sum + amount(cost), 0);

  return {
    custo_total: itemTotal || Number(meta?.cost ?? meta?.call?.cost ?? 0) || 0,
    custo_stt: byType(['stt', 'transcription', 'transcriber']),
    custo_tts: byType(['tts', 'voice']),
    custo_vapi: byType(['vapi', 'service'])
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnv();

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL e chave Supabase sao obrigatorios.');

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from('calls')
    .select('id, vapi_call_id, custo_total, custo_stt, custo_tts, custo_vapi, metadata_raw')
    .or('custo_total.is.null,custo_total.eq.0')
    .not('metadata_raw', 'is', null)
    .limit(args.limit);

  if (error) throw error;

  const updates = [];
  for (const call of data || []) {
    const calculated = calculateCosts(call.metadata_raw);
    if (calculated.custo_total <= 0) continue;

    updates.push({ id: call.id, vapi_call_id: call.vapi_call_id, ...calculated });

    if (args.apply) {
      const { error: updateError } = await supabase
        .from('calls')
        .update(calculated)
        .eq('id', call.id);
      if (updateError) throw updateError;
    }
  }

  console.log(JSON.stringify({
    apply: args.apply,
    scanned: data?.length || 0,
    updated: updates.length,
    sample: updates.slice(0, 10)
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
