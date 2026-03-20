import { Router } from 'express';
import { format, toZonedTime } from 'date-fns-tz';
import { env } from '../config/env.js';
import { supabaseAdmin } from '../lib/supabase.js';

type ProcessResult = { contactId: string; contactName: string; success: boolean; error?: string };

// concorrencia e delay entre lotes de contatos
const DELAY_BETWEEN_BATCHES_MS = 1000; // 25 minutos
const CONCURRENT_BATCH_SIZE = 10;

// para evitar sobrecarga no VAPI, vamos limitar a 500 chamadas a cada 25 minutos, o que da cerca de 1200 chamadas por hora, considerando tentativas e contatos que nao tem telefone
const DELAY_BETWEEN_500_BATCHES_MS = 1200000; // 25 minutos

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export const campaignsRouter = Router();

campaignsRouter.post('/start', async (req, res) => {
  try {
    const { campaignId } = req.body as { campaignId?: string };
    if (!campaignId) return res.status(400).json({ success: false, error: 'campaignId obrigatorio' });

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

    const { data: campaignContacts, error: contactsError } = await supabaseAdmin
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
      .in('status', ['pendente', 'em_andamento']);

    if (contactsError) throw new Error(`Erro ao buscar contatos: ${contactsError.message}`);
    if (!campaignContacts || campaignContacts.length === 0) {
      return res.json({ success: true, message: 'Nenhum contato pendente', totalProcessed: 0, successful: 0, failed: 0 });
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
      return res.json({ success: true, message: 'Nenhum contato elegivel', totalProcessed: 0, successful: 0, failed: 0 });
    }

    const contactIds = eligibleContacts.map((cc: any) => cc.contact_id);
    const { data: phones } = await supabaseAdmin
      .from('contact_phones')
      .select('*')
      .in('contact_id', contactIds)
      .order('prioridade', { ascending: true });

    const phonesByContactId = new Map<string, any>();
    phones?.forEach((phone: any) => {
      if (!phonesByContactId.has(phone.contact_id)) phonesByContactId.set(phone.contact_id, phone);
    });

    const { data: n8nSetting } = await supabaseAdmin
      .from('app_settings')
      .select('setting_value')
      .eq('setting_key', 'n8n_webhook_url')
      .limit(1)
      .maybeSingle();

    const n8nWebhookUrl =
      n8nSetting?.setting_value || 'https://n8n-n8n-start.xzz0ed.easypanel.host/webhook/callcenteria';
    const callbackUrl = `${env.backendPublicUrl}/api/webhooks/vapi/callback`;

    const processContact = async (cc: any, lineIndex: number): Promise<ProcessResult> => {
      const contact = Array.isArray(cc.contacts) ? cc.contacts[0] : cc.contacts;
      let phoneData = phonesByContactId.get(contact?.id);
      let phoneNumber = phoneData?.numero;

      if (!phoneNumber && contact?.telefone) {
        phoneNumber = contact.telefone;
        phoneData = { id: `fallback-${contact.id}` };
      }

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

        const n8nPayload = {
          contactId: contact.id,
          campaignContactId: cc.id,
          phoneId: phoneData?.id || null,
          campaignId: campaign.id,
          customerNumber: phoneNumber,
          customerName: contact.nome,
          customerCpf: contact.cpf,
          assistantId: campaign.assistant_vapi_id,
          phoneNumberId: linhaVapiId || String(campaign.linha_vapi_id || '').split(',')[0],
          callbackUrl,
          tipoTelefonia: campaign.tipo_telefonia
        };

        const response = await fetch(n8nWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(n8nPayload)
        });
        if (!response.ok) throw new Error(`Erro n8n: ${response.status} ${response.statusText}`);

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
    
    // logica para contemplar ratelimit do n8n e vapi, 
    // processando em lotes e com pausas de 25min a cada 500 envios 
    // para evitar sobrecarga e garantir que as chamadas sejam processadas 
    // corretamente, mesmo para campanhas grandes
    let processedCount = 0;
    for (let i = 0; i < eligibleContacts.length; i += CONCURRENT_BATCH_SIZE) {
      const batch = eligibleContacts.slice(i, i + CONCURRENT_BATCH_SIZE);

      const batchResult = await Promise.all(
        batch.map((contact: any, index: number) =>
          processContact(contact, i + index)
        )
      );

      allResults.push(...batchResult);

      processedCount += batch.length;

      const hasMore = i + CONCURRENT_BATCH_SIZE < eligibleContacts.length;

      if (hasMore) {
        // pausa longa a cada 500
        if (processedCount % 500 === 0) {
          console.log(`Atingiu ${processedCount} envios. Pausando 25 minutos...`);
          await new Promise((resolve) =>
            setTimeout(resolve, DELAY_BETWEEN_500_BATCHES_MS)
          );
        } else {
          // pausa curta entre lotes
          await new Promise((resolve) =>
            setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS)
          );
        }
      }
    }

    const successful = allResults.filter((r) => r.success).length;
    const failed = allResults.filter((r) => !r.success).length;

    return res.json({
      success: true,
      message: `Processamento concluido: ${successful} iniciadas, ${failed} falhas`,
      totalProcessed: allResults.length,
      successful,
      failed,
      results: allResults
    });
  } catch (error: any) {
    console.error('[campaigns/start] error', error);
    return res.status(500).json({ success: false, error: error.message || 'Erro ao iniciar campanha' });
  }
});
