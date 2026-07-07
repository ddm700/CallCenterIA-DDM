import { Contact } from '../types';
import { apiRequest } from '../lib/apiClient';
import { logService } from './logService';

export interface CampaignStartResponse {
  success: boolean;
  message?: string;
  campaignId?: string;
  totalProcessed?: number;
  successful?: number;
  failed?: number;
  remainingPending?: number;
  completed?: boolean;
  error?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const campaignService = {
  async startCampaign(campaignId: string, campaignName: string): Promise<CampaignStartResponse> {
    const msg = `Iniciando campanha via Backend: ${campaignName} (ID: ${campaignId})`;
    console.log(msg);
    await logService.addLog('info', 'Campaign', msg);

    try {
      const totals: CampaignStartResponse = {
        success: true,
        totalProcessed: 0,
        successful: 0,
        failed: 0,
        remainingPending: undefined,
        completed: undefined
      };

      for (let cycle = 1; cycle <= 100; cycle += 1) {
        const data = await apiRequest<CampaignStartResponse>('/api/campaigns/start', {
          method: 'POST',
          body: JSON.stringify({ campaignId })
        });

        totals.totalProcessed = (totals.totalProcessed || 0) + (data.totalProcessed || 0);
        totals.successful = (totals.successful || 0) + (data.successful || 0);
        totals.failed = (totals.failed || 0) + (data.failed || 0);
        totals.remainingPending = data.remainingPending;
        totals.completed = data.completed;
        totals.message = data.message;

        await logService.addLog('info', 'Campaign', `Ciclo ${cycle} de disparo processado.`, data);

        if (typeof data.completed !== 'boolean') {
          break;
        }

        if (data.completed) {
          break;
        }

        if ((data.totalProcessed || 0) === 0) {
          throw new Error(
            `Backend nao processou contatos neste ciclo. Pendentes informados: ${data.remainingPending ?? 'desconhecido'}`
          );
        }

        await sleep(750);
      }

      const successMsg =
        totals.completed === true
          ? `Campanha processada. Aceitos: ${totals.successful || 0}; falhas: ${totals.failed || 0}.`
          : 'Comando enviado com sucesso. O backend iniciou ou continuou o processamento.';
      console.log(successMsg, totals);
      await logService.addLog('success', 'Campaign', successMsg, totals);
      return totals;
    } catch (e: any) {
      const errText = `Falha critica ao iniciar campanha: ${e.message}`;
      console.error(errText, e);
      alert(`Erro ao iniciar campanha no servidor:\n${e.message}`);
      await logService.addLog('error', 'Campaign', errText, { rawError: e });
      throw e;
    }
  },
  async callSingleContact(contact: Contact): Promise<void> {
    const msg = `Solicitando chamada individual para: ${contact.name}`;
    console.log(msg);
    await logService.addLog('info', 'Call', msg);

    try {
      const body = {
        contactId: contact.contactId,
        campaignContactId: contact.id,
        campaignId: contact.campaignId,
        customerNumber: contact.phone,
        customerName: contact.name,
        customerCpf: contact.cpf,
        phoneId: contact.contactId
      };

      const data = await apiRequest<{ success: boolean; error?: string }>('/api/calls/initiate', {
        method: 'POST',
        body: JSON.stringify(body)
      });

      await logService.addLog('success', 'Call', 'Chamada individual solicitada com sucesso.', data);
    } catch (e: any) {
      alert(`Erro ao iniciar ligacao:\n${e.message}`);
      await logService.addLog('error', 'Call', `Falha ao solicitar chamada individual: ${e.message}`, { rawError: e });
      throw e;
    }
  }
};
