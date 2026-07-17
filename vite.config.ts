import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const appEnv = {
      VITE_SUPABASE_URL: env.VITE_SUPABASE_URL || env.SUPABASE_URL || '',
      VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '',
      VITE_API_BASE_URL: env.VITE_API_BASE_URL || '',
      VITE_N8N_WEBHOOK_VAPI: env.VITE_N8N_WEBHOOK_VAPI || '',
      VITE_N8N_WEBHOOK_WHATSAPP: env.VITE_N8N_WEBHOOK_WHATSAPP || '',
      VITE_VAPI_API_KEY: env.VITE_VAPI_API_KEY || ''
    };

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api': {
            target: 'http://localhost:4000',
            changeOrigin: true
          },
          '/health': {
            target: 'http://localhost:4000',
            changeOrigin: true
          }
        }
      },
      plugins: [react()],
      define: {
        __APP_ENV__: JSON.stringify(appEnv),
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
