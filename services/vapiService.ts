import { apiRequest } from '../lib/apiClient';
import { getVapiSettings } from '../lib/settings';
import { VapiAssistant, VapiPhoneNumber } from '../types';

type VapiResourcesResponse = {
  success: boolean;
  assistants: VapiAssistant[];
  phoneNumbers: VapiPhoneNumber[];
};

async function directAssistantsFallback(): Promise<VapiAssistant[]> {
  try {
    const settings = getVapiSettings();
    if (!settings.apiKey) return [];

    const response = await fetch('https://api.vapi.ai/assistant', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : data.results || [];
  } catch {
    return [];
  }
}

async function directPhonesFallback(): Promise<VapiPhoneNumber[]> {
  try {
    const settings = getVapiSettings();
    if (!settings.apiKey) return [];

    const response = await fetch('https://api.vapi.ai/phone-number', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : data.results || [];
  } catch {
    return [];
  }
}

export const vapiService = {
  async getAssistants(): Promise<VapiAssistant[]> {
    try {
      const data = await apiRequest<VapiResourcesResponse>('/api/vapi/resources', { method: 'GET' });
      if (data.success && Array.isArray(data.assistants)) return data.assistants;
    } catch (error) {
      console.warn('Backend VAPI resources falhou, usando fallback direto.', error);
    }
    return directAssistantsFallback();
  },

  async getPhoneNumbers(): Promise<VapiPhoneNumber[]> {
    try {
      const data = await apiRequest<VapiResourcesResponse>('/api/vapi/resources', { method: 'GET' });
      if (data.success && Array.isArray(data.phoneNumbers)) return data.phoneNumbers;
    } catch (error) {
      console.warn('Backend VAPI resources falhou, usando fallback direto.', error);
    }
    return directPhonesFallback();
  }
};
