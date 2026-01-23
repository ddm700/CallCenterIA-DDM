// Keys for LocalStorage
export const APP_SETTINGS_KEYS = {
  SUPABASE: 'app_settings_supabase',
  N8N: 'app_settings_n8n',
  VAPI: 'app_settings_vapi',
};

// Helper to safely get env vars
const getEnv = (key: string) => {
  try {
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
      return JSON.parse(stored);
    } catch (e) {
      console.error('Failed to parse stored Supabase settings', e);
    }
  }
  return {
    url: getEnv('VITE_SUPABASE_URL') || 'https://mkrkkvbseobdqsalrorl.supabase.co',
    key: getEnv('VITE_SUPABASE_ANON_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rcmtrdmJzZW9iZHFzYWxyb3JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNDcwNTgsImV4cCI6MjA3NzkyMzA1OH0.OaGaavmaKda3LGUIiapB02Nqg7DZz7G7ntuJnvgRnRo'
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
    webhookVapi: getEnv('VITE_N8N_WEBHOOK_VAPI') || 'https://n8n-n8n-start.xzz0ed.easypanel.host/webhook/callcenteria',
    webhookWhatsapp: getEnv('VITE_N8N_WEBHOOK_WHATSAPP') || 'https://seu-n8n.com/webhook/whatsapp',
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
    apiKey: getEnv('VITE_VAPI_API_KEY') || '332987f4-f832-4542-9fd0-76de02bde971'
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