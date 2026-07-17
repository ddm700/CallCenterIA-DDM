// Keys for LocalStorage
export const APP_SETTINGS_KEYS = {
  SUPABASE: 'app_settings_supabase',
  N8N: 'app_settings_n8n',
  VAPI: 'app_settings_vapi',
};

declare const __APP_ENV__: Record<string, string> | undefined;

// Helper to safely get env vars
const getEnv = (key: string) => {
  try {
    if (typeof __APP_ENV__ !== 'undefined' && __APP_ENV__?.[key]) {
      return __APP_ENV__[key];
    }

    // @ts-ignore
    return (import.meta && import.meta.env && import.meta.env[key]) || '';
  } catch (e) {
    return '';
  }
};

// --- Interfaces ---
export interface SupabaseSettings {
  url: string;
  key: string;
}

export interface N8nSettings {
  webhookVapi: string;
  webhookWhatsapp: string;
  token?: string;
}

export interface VapiSettings {
  apiKey: string;
}

// --- Getters (Env -> LocalStorage) ---

export const getSupabaseSettings = (): SupabaseSettings => {
  const stored = localStorage.getItem(APP_SETTINGS_KEYS.SUPABASE);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      // Ignore stale/empty localStorage settings and fallback to env values.
      if (parsed?.url && parsed?.key) {
        return parsed;
      }
    } catch (e) {
      console.error('Failed to parse stored Supabase settings', e);
    }
  }
  return {
    url: getEnv('VITE_SUPABASE_URL') || '',
    key: getEnv('VITE_SUPABASE_ANON_KEY') || ''
  };
};

export const getN8nSettings = (): N8nSettings => {
  const stored = localStorage.getItem(APP_SETTINGS_KEYS.N8N);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error('Failed to parse stored n8n settings', e);
    }
  }
  return {
    webhookVapi: getEnv('VITE_N8N_WEBHOOK_VAPI') || '',
    webhookWhatsapp: getEnv('VITE_N8N_WEBHOOK_WHATSAPP') || '',
    token: ''
  };
};

export const getVapiSettings = (): VapiSettings => {
  const stored = localStorage.getItem(APP_SETTINGS_KEYS.VAPI);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error('Failed to parse stored VAPI settings', e);
    }
  }
  return {
    apiKey: getEnv('VITE_VAPI_API_KEY') || ''
  };
};

// --- Setters ---

export const saveSupabaseSettings = (settings: SupabaseSettings) => {
  localStorage.setItem(APP_SETTINGS_KEYS.SUPABASE, JSON.stringify(settings));
};

export const saveN8nSettings = (settings: N8nSettings) => {
  localStorage.setItem(APP_SETTINGS_KEYS.N8N, JSON.stringify(settings));
};

export const saveVapiSettings = (settings: VapiSettings) => {
  localStorage.setItem(APP_SETTINGS_KEYS.VAPI, JSON.stringify(settings));
};

// --- Reset (Optional, to clear overrides) ---
export const resetSettings = () => {
  localStorage.removeItem(APP_SETTINGS_KEYS.SUPABASE);
  localStorage.removeItem(APP_SETTINGS_KEYS.N8N);
  localStorage.removeItem(APP_SETTINGS_KEYS.VAPI);
};
