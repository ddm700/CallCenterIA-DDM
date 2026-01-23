import { Contact } from '../types';
import { logService } from './logService';
import { supabase } from '../lib/supabaseClient';

/**
 * Service to handle interaction with Edge Functions.
 */

export const campaignService = {
  
  /**
   * Starts a campaign by invoking the 'start-campaign' Edge Function.
   */
  async startCampaign(campaignId: string, campaignName: string): Promise<{ success: boolean }> {
    const msg = `Iniciando campanha via Backend: ${campaignName} (ID: ${campaignId})`;
    console.log(msg);
    await logService.addLog('info', 'Campaign', msg);
    
    try {
        const { data, error } = await supabase.functions.invoke('start-campaign', {
          method: 'POST',
          body: { campaignId }
        });

        if (error) {
             console.error("Edge Function Error:", error);
             const errorMsg = error.message || JSON.stringify(error);
             // Alert user immediately about backend failure
             alert(`Erro ao iniciar campanha no servidor:\n${errorMsg}\n\nVerifique se o Webhook do n8n está salvo nas Configurações.`);
             throw new Error(`Erro na Edge Function: ${errorMsg}`);
        }

        const successMsg = `Comando enviado com sucesso! O backend iniciou o processamento.`;
        console.log(successMsg, data);
        await logService.addLog('success', 'Campaign', successMsg, data);
        return { success: true };

    } catch (e: any) {
        const errText = `Falha crítica ao iniciar campanha: ${e.message}`;
        console.error(errText, e);
        await logService.addLog('error', 'Campaign', errText, { rawError: e });
        throw e;
    }
  },

  /**
   * Trigger a single call via 'initiate-vapi-call' Edge Function.
   */
  async callSingleContact(contact: Contact): Promise<void> {
    const msg = `Solicitando chamada individual para: ${contact.name}`;
    console.log(msg);
    await logService.addLog('info', 'Call', msg);

    try {
        // Construct payload matching backend expectations
        // Note: phoneId is required by backend. If not available separately, we use contactId as fallback
        const body = {
            contactId: contact.contactId,
            campaignContactId: contact.id,
            campaignId: contact.campaignId,
            customerNumber: contact.phone,
            customerName: contact.name,
            phoneId: contact.contactId // Fallback to satisfy backend requirement
        };

        const { data, error } = await supabase.functions.invoke('initiate-vapi-call', {
          method: 'POST',
          body: body
        });

        if (error) {
             console.error("Edge Function Error:", error);
             const errorMsg = error.message || JSON.stringify(error);
             alert(`Erro ao iniciar ligação:\n${errorMsg}`);
             throw new Error(`Erro na Edge Function: ${errorMsg}`);
        }

        await logService.addLog('success', 'Call', `Chamada individual solicitada com sucesso.`, data);
        // We do not alert on success here to allow the UI to just update the spinner/status naturally, 
        // or let the calling component handle the success message if desired.
    } catch (e: any) {
        await logService.addLog('error', 'Call', `Falha ao solicitar chamada individual: ${e.message}`, { rawError: e });
        throw e;
    }
  }
};