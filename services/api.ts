import { Contact } from '../types';
import { apiRequest } from '../lib/apiClient';
import { logService } from './logService';

export const campaignService = {
  async startCampaign(campaignId: string, campaignName: string): Promise<{ success: boolean }> {
    const msg = `Iniciando campanha via Backend: ${campaignName} (ID: ${campaignId})`;
    console.log(msg);
    await logService.addLog('info', 'Campaign', msg);

    try {
      const data = await apiRequest<{ success: boolean; error?: string }>('/api/campaigns/start', {
        method: 'POST',
        body: JSON.stringify({ campaignId })
      });

      const successMsg = 'Comando enviado com sucesso! O backend iniciou o processamento.';
      console.log(successMsg, data);
      await logService.addLog('success', 'Campaign', successMsg, data);
      return { success: true };
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
