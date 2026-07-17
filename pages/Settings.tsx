import React, { useEffect, useState } from 'react';
import { Card, Button, Input, Badge } from '../components/ui';
import { Database, Link2, Zap, ExternalLink, Save } from 'lucide-react';
import { checkSupabaseConnection } from '../lib/supabaseClient';
import { 
  getN8nSettings, 
  getSupabaseSettings, 
  getVapiSettings, 
  saveN8nSettings, 
  saveSupabaseSettings, 
  saveVapiSettings,
  N8nSettings,
  VapiSettings,
  SupabaseSettings
} from '../lib/settings';
import { supabaseService } from '../services/supabaseService';

const isLikelySupabaseAnonKey = (value: string) =>
  value.startsWith('eyJ') || value.startsWith('sb_publishable_');

export const Settings: React.FC = () => {
  const [supabaseConnected, setSupabaseConnected] = useState<boolean>(false);
  
  // State for form fields
  const [supabaseConfig, setSupabaseConfig] = useState<SupabaseSettings>({ url: '', key: '' });
  const [n8nConfig, setN8nConfig] = useState<N8nSettings>({ webhookVapi: '', webhookWhatsapp: '', token: '' });
  const [vapiConfig, setVapiConfig] = useState<VapiSettings>({ apiKey: '' });
  const [saving, setSaving] = useState(false);

  // Load settings on mount
  useEffect(() => {
    // 1. Load from local first (fast)
    setSupabaseConfig(getSupabaseSettings());
    setN8nConfig(getN8nSettings());
    setVapiConfig(getVapiSettings());
    
    checkConnection();

    // 2. Try to sync from DB
    syncFromDb();
  }, []);

  const syncFromDb = async () => {
    try {
      const dbSettings = await supabaseService.getSettingsFromDb();
      if (Object.keys(dbSettings).length > 0) {
        // Update local state if DB has values
        if (dbSettings['vapi_api_key']) setVapiConfig(prev => ({ ...prev, apiKey: dbSettings['vapi_api_key'] }));
        
        const newN8n = { ...getN8nSettings() };
        // Check multiple possible keys for n8n webhook
        if (dbSettings['n8n_webhook_vapi']) newN8n.webhookVapi = dbSettings['n8n_webhook_vapi'];
        else if (dbSettings['webhook_url']) newN8n.webhookVapi = dbSettings['webhook_url']; // Fallback key
        
        if (dbSettings['n8n_webhook_whatsapp']) newN8n.webhookWhatsapp = dbSettings['n8n_webhook_whatsapp'];
        
        setN8nConfig(newN8n);
      }
    } catch (e) {
      console.warn("Could not sync settings from DB (Supabase might not be connected yet)");
    }
  };

  const checkConnection = () => {
    checkSupabaseConnection().then(setSupabaseConnected);
  };

  const handleSaveSupabase = () => {
    if (!supabaseConfig.url || !supabaseConfig.key) {
      alert('Preencha Project URL e Anon Key do Supabase.');
      return;
    }

    if (!isLikelySupabaseAnonKey(supabaseConfig.key)) {
      alert('Anon Key invalida. Use a chave publica do Supabase (eyJ... ou sb_publishable_...).');
      return;
    }

    saveSupabaseSettings(supabaseConfig);
    checkConnection();
    alert('Configurações do Supabase salvas! (Recarregue a página para aplicar totalmente)');
  };

  const handleSaveN8n = async () => {
    setSaving(true);
    try {
        saveN8nSettings(n8nConfig);
        
        // Save to DB with multiple keys to ensure compatibility with Edge Functions
        // We save both 'n8n_webhook_vapi' and generic 'webhook_url' just in case the backend uses that.
        await supabaseService.saveSettingToDb('n8n_webhook_vapi', n8nConfig.webhookVapi);
        await supabaseService.saveSettingToDb('webhook_url', n8nConfig.webhookVapi); 
        
        await supabaseService.saveSettingToDb('n8n_webhook_whatsapp', n8nConfig.webhookWhatsapp);
        
        alert('Integrações n8n salvas com sucesso no Banco de Dados!');
    } catch (e) {
        console.error(e);
        alert('Erro ao salvar no banco de dados. Verifique a conexão.');
    } finally {
        setSaving(false);
    }
  };

  const handleSaveVapi = async () => {
    setSaving(true);
    try {
        saveVapiSettings(vapiConfig);
        await supabaseService.saveSettingToDb('vapi_api_key', vapiConfig.apiKey);
        alert('Chave VAPI salva com sucesso no Banco de Dados!');
    } catch (e) {
        console.error(e);
        alert('Erro ao salvar chave VAPI.');
    } finally {
        setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      
      {/* Supabase Status */}
      <Card className="p-6">
        <div className="flex items-start gap-3 mb-6">
          <Database className="w-6 h-6 text-green-600 dark:text-green-400" />
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Banco de Dados (Supabase)</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Conexão principal de dados</p>
          </div>
        </div>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleSaveSupabase();
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600 dark:text-slate-300">Status da Conexão</span>
            <Badge variant={supabaseConnected ? "success" : "danger"}>
              {supabaseConnected ? "Conectado" : "Verificar Config"}
            </Badge>
          </div>
          
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Project URL</label>
            <input 
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 p-2 rounded text-sm font-mono text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-primary outline-none"
              value={supabaseConfig.url}
              onChange={(e) => setSupabaseConfig({...supabaseConfig, url: e.target.value})}
              placeholder="https://..."
            />
          </div>
          
           <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Anon Key</label>
            <input 
              type="password"
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 p-2 rounded text-sm font-mono text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-primary outline-none"
              value={supabaseConfig.key}
              onChange={(e) => setSupabaseConfig({...supabaseConfig, key: e.target.value})}
              placeholder="eyJ..."
            />
          </div>

          <div className="flex gap-3">
             <Button type="button" variant="outline" className="flex-1" icon={ExternalLink} onClick={() => window.open('https://supabase.com/dashboard', '_blank')}>
                Dashboard
             </Button>
             <Button type="submit" className="flex-1" icon={Save}>
                Salvar
             </Button>
          </div>
        </form>
      </Card>

      {/* n8n Integration */}
      <Card className="p-6">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-start gap-3">
             <Link2 className="w-6 h-6 text-primary" />
             <div>
               <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Integração n8n</h3>
               <p className="text-sm text-slate-500 dark:text-slate-400">Webhook para campanhas de voz (VAPI)</p>
             </div>
          </div>
          <Badge variant="success">Ativo</Badge>
        </div>

        <div className="space-y-4">
           <Input 
             label="URL do Webhook *" 
             value={n8nConfig.webhookVapi}
             onChange={(e) => setN8nConfig({...n8nConfig, webhookVapi: e.target.value})}
             placeholder="https://n8n.seu-dominio.com/webhook/..."
           />
           <p className="text-xs text-slate-400 -mt-2">Disparado ao iniciar campanha VAPI</p>
           
           <Input 
             label="Token de Autenticação (opcional)" 
             value={n8nConfig.token || ''}
             onChange={(e) => setN8nConfig({...n8nConfig, token: e.target.value})}
             placeholder="Bearer token..." 
           />

           <div className="flex gap-3">
              <Button variant="outline" className="flex-1">Testar</Button>
              <Button className="flex-1" icon={Save} onClick={handleSaveN8n} disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar'}
              </Button>
           </div>
        </div>
      </Card>

      {/* WhatsApp n8n Integration */}
      <Card className="p-6">
        <div className="flex items-start justify-between mb-6">
           <div className="flex items-start gap-3">
              <Zap className="w-6 h-6 text-green-500 dark:text-green-400" />
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Integração n8n - WhatsApp</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Webhook para campanhas de mensagens</p>
              </div>
           </div>
           <Badge variant="success">Ativo</Badge>
        </div>
        
        <div className="space-y-4">
           <Input 
             label="URL do Webhook WhatsApp *" 
             value={n8nConfig.webhookWhatsapp}
             onChange={(e) => setN8nConfig({...n8nConfig, webhookWhatsapp: e.target.value})}
             placeholder="https://n8n.seu-dominio.com/webhook/..."
           />
           
           <Button className="w-full" icon={Save} onClick={handleSaveN8n} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar Configuração'}
           </Button>
        </div>
      </Card>

      {/* VAPI Configuration */}
      <Card className="p-6">
         <div className="flex items-start justify-between mb-6">
           <div className="flex items-start gap-3">
              <Zap className="w-6 h-6 text-primary" />
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Configuração VAPI</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Credenciais da API de Voz</p>
              </div>
           </div>
           <Badge variant={vapiConfig.apiKey ? "success" : "danger"}>{vapiConfig.apiKey ? "Chave Definida" : "Sem Chave"}</Badge>
         </div>

         <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveVapi();
            }}
         >
            <Input 
              label="VAPI Private Key *"
              type="password"
              value={vapiConfig.apiKey}
              onChange={(e) => setVapiConfig({...vapiConfig, apiKey: e.target.value})}
              placeholder="sk-..."
            />
            <p className="text-xs text-slate-400 -mt-2">Chave privada obtida no dashboard da VAPI</p>

            <Button type="button" variant="secondary" className="w-full">Validar Conexão</Button>
            <Button type="button" variant="outline" className="w-full" icon={ExternalLink} onClick={() => window.open('https://dashboard.vapi.ai', '_blank')}>Painel VAPI</Button>
            <Button type="submit" className="w-full" icon={Save} disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar Chave'}
            </Button>
         </form>
      </Card>
    </div>
  );
};
