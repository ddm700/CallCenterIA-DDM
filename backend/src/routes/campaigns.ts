import { Router } from 'express';
import { format, toZonedTime } from 'date-fns-tz';
import { env } from '../config/env.js';
import { createQueuedCallRecord, getBackendPublicUrl } from '../lib/calls.js';
import { supabaseAdmin } from '../lib/supabase.js';
import {
  getDispatchErrorMessage,
  getN8nWebhookUrl,
  postWebhookWithRetries,
  RequestPacer
} from '../services/callDispatch.js';

type ProcessResult = { contactId: string; contactName: string; success: boolean; error?: string };

const SUPABASE_PAGE_SIZE = 1000;
const activeCampaignRuns = new Set<string>();

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

async function processWithConcurrency<T, TResult>(
  items: T[],
  concurrency: number,
  handler: (item: T, index: number) => Promise<TResult>
): Promise<TResult[]> {
  const results = new Array<TResult>(items.length);
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

async function executeCampaignStart(
  campaignId: string,
  deadlineAt: number = Date.now() + env.campaignDispatchTimeBudgetMs
): Promise<{
  totalProcessed: number;
  successful: number;
  failed: number;
  remainingPending: number;
  completed: boolean;
}> {
  const { data: campaign, error: campaignError } = await supabaseAdmin
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .single();
  if (campaignError || !campaign) throw new Error('Campanha nao encontrada');
  if (!campaign.ativa) throw new Error('Campanha nao esta ativa');

  if (!campaign.ignore_horario && campaign.janela_inicio && campaign.janela_fim) {
    const brasiliaTime = toZonedTime(new Date(), 'America/Sao_Paulo');
    const currentHour = format(brasiliaTime, 'HH:mm', { timeZone: 'America/Sao_Paulo' });
    if (currentHour < campaign.janela_inicio || currentHour > campaign.janela_fim) {
      throw new Error(`Fora do horario (${campaign.janela_inicio} - ${campaign.janela_fim})`);
    }
  }

  let vapiLines: string[] = [];
  if (campaign.tipo_telefonia === 'vapi') {
    if (!campaign.assistant_vapi_id || !campaign.linha_vapi_id) {
      throw new Error('Campanha sem configuracao VAPI completa');
    }
    vapiLines = shuffleArray(String(campaign.linha_vapi_id).split(',').filter(Boolean));
    if (vapiLines.length === 0) throw new Error('Nenhuma linha VAPI configurada');
  }

  // Paginacao: busca todos os contatos pendentes em paginas de 1000
  const campaignContacts: any[] = [];
  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const { data, error: contactsError } = await supabaseAdmin
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
      .eq('campaign_id', campaignId)
      .eq('status', 'pendente')
      .range(from, from + SUPABASE_PAGE_SIZE - 1);

    if (contactsError) throw new Error(`Erro ao buscar contatos: ${contactsError.message}`);
    if (!data || data.length === 0) break;

    campaignContacts.push(...data);

    if (data.length < SUPABASE_PAGE_SIZE) {
      break;
    }
  }

  if (campaignContacts.length === 0) {
    return { totalProcessed: 0, successful: 0, failed: 0, remainingPending: 0, completed: true };
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
    return { totalProcessed: 0, successful: 0, failed: 0, remainingPending: 0, completed: true };
  }

  const n8nWebhookUrl = await getN8nWebhookUrl();
  const resolvedBackendPublicUrl = await getBackendPublicUrl();
  const callbackUrl = `${resolvedBackendPublicUrl}/api/webhooks/vapi/callback`;
  const pacer = new RequestPacer();
  const campaignConcurrency = Math.max(1, Number(campaign.ligacoes_simultaneas) || 1);
  const effectiveConcurrency = Math.min(env.campaignStartMaxConcurrency, campaignConcurrency);

  const processContact = async (cc: any, lineIndex: number): Promise<ProcessResult> => {
    const contact = Array.isArray(cc.contacts) ? cc.contacts[0] : cc.contacts;
    const phoneNumber = contact?.telefone ?? null;

    if (!phoneNumber || !contact) {
      return {
        contactId: contact?.id || cc.contact_id,
        contactName: contact?.nome || 'Desconhecido',
        success: false,
        error: 'Sem telefone cadastrado ou contato nao encontrado'
      };
    }

    try {
      const linhaVapiId = campaign.tipo_telefonia === 'vapi' ? vapiLines[lineIndex % vapiLines.length] : null;
      const phoneNumberId = linhaVapiId || String(campaign.linha_vapi_id || '').split(',')[0];

      await createQueuedCallRecord({
        campaignContactId: cc.id,
        contactPhoneId: null,
        customerNumber: phoneNumber,
        campaignName: campaign.nome,
        customerCpf: contact.cpf,
        customerName: contact.nome,
        assistantId: campaign.assistant_vapi_id,
        phoneNumberId
      });

      const n8nPayload = {
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
        tipoTelefonia: campaign.tipo_telefonia
      };

      const dispatchResult = await postWebhookWithRetries(n8nWebhookUrl, n8nPayload, pacer);
      if (!dispatchResult.ok) {
        throw new Error(getDispatchErrorMessage(dispatchResult));
      }

      const { error: updateError } = await supabaseAdmin
        .from('campaign_contacts')
        .update({
          status: 'em_andamento',
          tentativas_realizadas: (cc.tentativas_realizadas || 0) + 1,
          ultima_tentativa: new Date().toISOString()
        })
        .eq('id', cc.id);
      if (updateError) console.warn('Nao foi possivel atualizar campaign_contacts', updateError.message);

      return { contactId: contact.id, contactName: contact.nome, success: true };
    } catch (error: any) {
      return { contactId: contact.id, contactName: contact.nome, success: false, error: error.message };
    }
  };

  const allResults: ProcessResult[] = [];
  const chunkSize = Math.max(1, effectiveConcurrency);
  let cursor = 0;
  let stoppedForTimeBudget = false;

  console.log(
    `[campaigns/start] iniciando ate ${eligibleContacts.length} contatos elegiveis ` +
      `com concorrencia=${effectiveConcurrency}, ` +
      `requestIntervalMs=${env.campaignStartRequestIntervalMs}, ` +
      `deadlineEmMs=${deadlineAt - Date.now()}`
  );

  while (cursor < eligibleContacts.length) {
    if (Date.now() >= deadlineAt) {
      stoppedForTimeBudget = true;
      break;
    }

    const chunk = eligibleContacts.slice(cursor, cursor + chunkSize);
    const chunkResult = await processWithConcurrency(chunk, effectiveConcurrency, (contact: any, index: number) =>
      processContact(contact, cursor + index)
    );

    allResults.push(...chunkResult);
    cursor += chunk.length;
  }

  const successful = allResults.filter((r) => r.success).length;
  const failed = allResults.length - successful;
  const remainingPending = eligibleContacts.length - allResults.length;

  console.log(
    `[campaigns/start] ciclo finalizado: processados=${allResults.length} ` +
      `sucesso=${successful} falhas=${failed} restantes=${remainingPending} ` +
      `${stoppedForTimeBudget ? '(interrompido por orcamento de tempo, retomara no proximo ciclo)' : '(concluido)'}`
  );

  return {
    totalProcessed: allResults.length,
    successful,
    failed,
    remainingPending,
    completed: remainingPending === 0
  };
}

export const campaignsRouter = Router();

campaignsRouter.post('/start', async (req, res) => {
  const { campaignId } = req.body as { campaignId?: string };

  try {
    if (!campaignId) return res.status(400).json({ success: false, error: 'campaignId obrigatorio' });

    if (activeCampaignRuns.has(campaignId)) {
      return res.status(409).json({
        success: false,
        error: 'Ja existe uma execucao em andamento para esta campanha'
      });
    }

    activeCampaignRuns.add(campaignId);
    const summary = await executeCampaignStart(campaignId);
    activeCampaignRuns.delete(campaignId);

    console.log(
      `[campaigns/start] ciclo concluido campaign=${campaignId} ` +
        `processados=${summary.totalProcessed} sucesso=${summary.successful} falhas=${summary.failed} ` +
        `restantes=${summary.remainingPending}`
    );

    return res.status(202).json({
      success: true,
      message: summary.completed
        ? 'Processamento concluido'
        : `Ciclo parcial processado. ${summary.remainingPending} contatos permanecem pendentes e serao ` +
          'retomados automaticamente pelo dispatch-cron (ou numa nova chamada a este endpoint).',
      campaignId,
      ...summary
    });
  } catch (error: any) {
    if (campaignId) {
      activeCampaignRuns.delete(campaignId);
    }
    console.error('[campaigns/start] error', error);
    return res.status(500).json({ success: false, error: error.message || 'Erro ao iniciar campanha' });
  }
});

campaignsRouter.get('/dispatch-cron', async (req, res) => {
  if (!env.cronSecret) {
    console.error('[campaigns/dispatch-cron] CRON_SECRET nao configurado; recusando execucao');
    return res.status(500).json({ success: false, error: 'CRON_SECRET nao configurado no backend' });
  }

  if (req.headers.authorization !== `Bearer ${env.cronSecret}`) {
    return res.status(401).json({ success: false, error: 'unauthorized' });
  }

  try {
    const { data, error } = await supabaseAdmin.from('campaigns').select('id, nome').eq('ativa', true);
    if (error) throw new Error(error.message);

    const activeCampaigns = (data || []) as Array<{ id: string; nome: string }>;
    const deadlineAt = Date.now() + env.campaignDispatchTimeBudgetMs;
    const results: Array<{ campaignId: string; nome: string; error?: string } & Record<string, unknown>> = [];

    for (const campaign of shuffleArray(activeCampaigns)) {
      if (Date.now() >= deadlineAt || activeCampaignRuns.has(campaign.id)) continue;

      activeCampaignRuns.add(campaign.id);
      try {
        const summary = await executeCampaignStart(campaign.id, deadlineAt);
        if (summary.totalProcessed > 0) {
          results.push({ campaignId: campaign.id, nome: campaign.nome, ...summary });
        }
      } catch (campaignError: any) {
        console.error(`[campaigns/dispatch-cron] erro na campanha ${campaign.id}`, campaignError.message);
        results.push({ campaignId: campaign.id, nome: campaign.nome, error: campaignError.message });
      } finally {
        activeCampaignRuns.delete(campaign.id);
      }
    }

    return res.json({ success: true, processed: results });
  } catch (error: any) {
    console.error('[campaigns/dispatch-cron] error', error);
    return res.status(500).json({ success: false, error: error.message || 'Erro ao rodar dispatch cron' });
  }
});
