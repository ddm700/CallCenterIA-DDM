import { apiRequest } from '../lib/apiClient';
import { VapiAssistant, VapiPhoneNumber } from '../types';

type VapiResourcesResponse = {
  success: boolean;
  assistants: VapiAssistant[];
  phoneNumbers: VapiPhoneNumber[];
};

export const vapiService = {
  async getAssistants(): Promise<VapiAssistant[]> {
    const data = await apiRequest<VapiResourcesResponse>('/api/vapi/resources', { method: 'GET' });
    return Array.isArray(data.assistants) ? data.assistants : [];
  },

  async getPhoneNumbers(): Promise<VapiPhoneNumber[]> {
    const data = await apiRequest<VapiResourcesResponse>('/api/vapi/resources', { method: 'GET' });
    return Array.isArray(data.phoneNumbers) ? data.phoneNumbers : [];
  }
};
