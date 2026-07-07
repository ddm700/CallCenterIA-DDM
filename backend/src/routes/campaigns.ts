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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
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

async function executeCampaignStart(campaignId: string): Promise<{
  totalProcessed: number;
  successful: number;
  failed: number;
}> {
  const { data: campaign, error: campaignError } = await supabaseAdmin.from('campaigns').select('*').eq('id', campaignId).single();
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
      .in('status', ['pendente', 'em_andamento'])
      .range(from, from + SUPABASE_PAGE_SIZE - 1);

    if (contactsError) throw new Error(`Erro ao buscar contatos: ${contactsError.message}`);
    if (!data || data.length === 0) break;

    campaignContacts.push(...data);

    if (data.length < SUPABASE_PAGE_SIZE) {
      break;
    }
  }

  if (campaignContacts.length === 0) {
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
    return { totalProcessed: 0, successful: 0, failed: 0 };
  }

  const n8nWebhookUrl = await getN8nWebhookUrl();
  const resolvedBackendPublicUrl = await getBackendPublicUrl();
  const callbackUrl = `${resolvedBackendPublicUrl}/api/webhooks/vapi/callback`;
  const pacer = new RequestPacer();

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

  console.log(
    `[campaigns/start] iniciando ${eligibleContacts.length} contatos ` +
      `com concorrencia=${env.campaignStartMaxConcurrency}, ` +
      `batchSize=${env.campaignStartBatchSize}, ` +
      `requestIntervalMs=${env.campaignStartRequestIntervalMs}, ` +
      `pauseMs=${env.campaignStartPauseMs}`
  );

  for (let i = 0; i < eligibleContacts.length; i += env.campaignStartBatchSize) {
    const batch = eligibleContacts.slice(i, i + env.campaignStartBatchSize);

    const batchResult = await processWithConcurrency(
      batch,
      env.campaignStartMaxConcurrency,
      (contact: any, index: number) => processContact(contact, i + index)
    );

    allResults.push(...batchResult);

    const processedCount = allResults.length;
    const successfulCount = allResults.filter((result) => result.success).length;
    const failedCount = processedCount - successfulCount;
    console.log(
      `[campaigns/start] lote finalizado: processados=${processedCount} ` +
        `sucesso=${successfulCount} falhas=${failedCount}`
    );

    const hasMore = i + env.campaignStartBatchSize < eligibleContacts.length;

    if (hasMore && env.campaignStartPauseMs > 0) {
      console.log(`[campaigns/start] pausando ${env.campaignStartPauseMs} ms antes do proximo lote`);
      await sleep(env.campaignStartPauseMs);
    }
  }

  const successful = allResults.filter((r) => r.success).length;
  const failed = allResults.filter((r) => !r.success).length;

  return {
    totalProcessed: allResults.length,
    successful,
    failed
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

    void (async () => {
      try {
        const summary = await executeCampaignStart(campaignId);
        console.log(
          `[campaigns/start] execucao concluida campaign=${campaignId} ` +
            `processados=${summary.totalProcessed} sucesso=${summary.successful} falhas=${summary.failed}`
        );
      } catch (error: any) {
        console.error('[campaigns/start] background error', error);
      } finally {
        activeCampaignRuns.delete(campaignId);
      }
    })();

    return res.status(202).json({
      success: true,
      message: 'Processamento iniciado em background',
      campaignId
    });
  } catch (error: any) {
    if (campaignId) {
      activeCampaignRuns.delete(campaignId);
    }
    console.error('[campaigns/start] error', error);
    return res.status(500).json({ success: false, error: error.message || 'Erro ao iniciar campanha' });
  }
});
