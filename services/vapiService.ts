import { supabase } from '../lib/supabaseClient';
import { VapiAssistant, VapiPhoneNumber } from '../types';
import { getVapiSettings } from '../lib/settings';

export const vapiService = {
  
  /**
   * Fetch all assistants via Edge Function with Fallback to Direct API
   */
  async getAssistants(): Promise<VapiAssistant[]> {
    // 1. Try Edge Function first
    try {
      const { data, error } = await supabase.functions.invoke('get-vapi-resources', {
        method: 'GET'
      });

      if (!error && data && data.success && Array.isArray(data.assistants)) {
        return data.assistants;
      }
      console.warn('Edge function failed or returned empty for assistants, trying direct API fallback...');
    } catch (error) {
      console.warn('Exception in Edge Function, trying fallback:', error);
    }

    // 2. Fallback: Direct API Call
    try {
        const settings = getVapiSettings();
        if (!settings.apiKey) return [];

        const response = await fetch('https://api.vapi.ai/assistant', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${settings.apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            // VAPI returns raw array or wrapped
            return Array.isArray(data) ? data : (data.results || []);
        }
    } catch (e) {
        console.error("Direct VAPI fetch failed:", e);
    }

    return [];
  },

  /**
   * Fetch all phone numbers via Edge Function with Fallback
   */
  async getPhoneNumbers(): Promise<VapiPhoneNumber[]> {
    // 1. Try Edge Function first
    try {
      const { data, error } = await supabase.functions.invoke('get-vapi-resources', {
        method: 'GET'
      });

      if (!error && data && data.success && Array.isArray(data.phoneNumbers)) {
        return data.phoneNumbers;
      }
    } catch (error) {
       console.warn('Exception in Edge Function for phones, trying fallback:', error);
    }

    // 2. Fallback: Direct API Call
    try {
        const settings = getVapiSettings();
        if (!settings.apiKey) return [];

        const response = await fetch('https://api.vapi.ai/phone-number', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${settings.apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            return Array.isArray(data) ? data : (data.results || []);
        }
    } catch (e) {
        console.error("Direct VAPI fetch failed:", e);
    }

    return [];
  }
};