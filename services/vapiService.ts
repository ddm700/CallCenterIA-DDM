import { apiRequest } from '../lib/apiClient';
import { VapiAssistant, VapiPhoneNumber } from '../types';

type VapiResourcesResponse = {
  success: boolean;
  assistants: VapiAssistant[];
  phoneNumbers: VapiPhoneNumber[];
};

export const vapiService = {
  async getResources(): Promise<{ assistants: VapiAssistant[]; phoneNumbers: VapiPhoneNumber[] }> {
    const data = await apiRequest<VapiResourcesResponse>('/api/vapi/resources', { method: 'GET' });
    return {
      assistants: Array.isArray(data.assistants) ? data.assistants : [],
      phoneNumbers: Array.isArray(data.phoneNumbers) ? data.phoneNumbers : []
    };
  },

  async getAssistants(): Promise<VapiAssistant[]> {
    const data = await this.getResources();
    return data.assistants;
  },

  async getPhoneNumbers(): Promise<VapiPhoneNumber[]> {
    const data = await this.getResources();
    return data.phoneNumbers;
  }
};
