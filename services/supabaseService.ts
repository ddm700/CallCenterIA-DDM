import { supabase } from '../lib/supabaseClient';
import { apiRequest } from '../lib/apiClient';
import { getSupabaseSettings } from '../lib/settings';
import { Campaign, Contact, Call, AcordoKpi } from '../types';

const IMPORT_CHUNK_SIZE = 300;

const chunkArray = <T,>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, (i + 1) * size));

async function importContactsDirectly(
  campaignId: string,
  contactsData: { nome: string; cpf: string; telefone: string; instituicao: string }[],
  onProgress?: (percent: number, label: string) => void
) {
  const report = (percent: number, label: string) => onProgress?.(Math.round(percent), label);

  report(5, 'Normalizando dados...');
  const contactsPayload = contactsData.map((contact) => {
    const cleanPhone = contact.telefone.replace(/\D/g, '');
    const normalizedPhone =
      cleanPhone.length === 12 || cleanPhone.length === 13 ? `+${cleanPhone}` : `+55${cleanPhone}`;

    return {
      nome: contact.nome || null,
      cpf: contact.cpf.replace(/\D/g, ''),
      instituicao: contact.instituicao || null,
      telefone: normalizedPhone
    };
  });

  report(10, 'Verificando contatos existentes...');
  const allPhones = contactsPayload.map((contact) => contact.telefone);
  const phoneChunks = chunkArray(allPhones, IMPORT_CHUNK_SIZE);
  const existingPhoneMap = new Map<string, string>();

  for (let i = 0; i < phoneChunks.length; i++) {
    const { data, error } = await supabase.from('contacts').select('id, telefone').in('telefone', phoneChunks[i]);
    if (error) throw error;
    data?.forEach((contact: any) => existingPhoneMap.set(contact.telefone, contact.id));
    report(10 + ((i + 1) / Math.max(phoneChunks.length, 1)) * 25, `Verificando contatos (${i + 1}/${phoneChunks.length})...`);
  }

  const newContacts = contactsPayload.filter((contact) => !existingPhoneMap.has(contact.telefone));
  const insertChunks = chunkArray(newContacts, IMPORT_CHUNK_SIZE);

  for (let i = 0; i < insertChunks.length; i++) {
    const { data, error } = await supabase.from('contacts').insert(insertChunks[i]).select('id, telefone');
    if (error) throw error;
    data?.forEach((contact: any) => existingPhoneMap.set(contact.telefone, contact.id));
    report(35 + ((i + 1) / Math.max(insertChunks.length, 1)) * 35, `Inserindo contatos (${i + 1}/${insertChunks.length})...`);
  }

  if (insertChunks.length === 0) report(70, 'Nenhum contato novo para inserir.');

  const processedIds = new Set<string>();
  const campaignPayload: Array<{ campaign_id: string; contact_id: string; status: string; tentativas: number }> = [];

  for (const contact of contactsPayload) {
    const contactId = existingPhoneMap.get(contact.telefone);
    if (contactId && !processedIds.has(contactId)) {
      campaignPayload.push({ campaign_id: campaignId, contact_id: contactId, status: 'pendente', tentativas: 0 });
      processedIds.add(contactId);
    }
  }

  const linkChunks = chunkArray(campaignPayload, IMPORT_CHUNK_SIZE);
  for (let i = 0; i < linkChunks.length; i++) {
    const { error: upsertErr } = await supabase
      .from('campaign_contacts')
      .upsert(linkChunks[i], { onConflict: 'campaign_id,contact_id', ignoreDuplicates: true });

    if (upsertErr) {
      const { error: insertErr } = await supabase.from('campaign_contacts').insert(linkChunks[i]);
      if (insertErr && !insertErr.message.includes('duplicate')) throw insertErr;
    }

    report(70 + ((i + 1) / Math.max(linkChunks.length, 1)) * 30, `Vinculando contatos (${i + 1}/${linkChunks.length})...`);
  }

  report(100, 'Importacao concluida.');

  return {
    success: true,
    totalRecebidos: contactsData.length,
    novosInseridos: newContacts.length,
    vinculados: campaignPayload.length,
    fallback: 'supabase-client'
  };
}

export const supabaseService = {

  // --- CAMPAIGNS ---

  async getCampaigns(): Promise<Campaign[]> {
    const { url, key } = getSupabaseSettings();
    if (!url || !key) {
      throw new Error('Supabase nÃ£o configurado. Preencha Project URL e Anon Key na tela ConfiguraÃ§Ãµes.');
    }

    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching campaigns:', error);
      throw error;
    }

    const campaigns = data || [];

    // Enrich campaigns with stats from campaign_contacts
    // Using Promise.all to fetch counts for each campaign
    const enrichedCampaigns = await Promise.all(campaigns.map(async (c: any) => {
      // Fetch Total Contacts count
      const { count: total } = await supabase
        .from('campaign_contacts')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', c.id);

      // Fetch Pending Contacts count
      const { count: pending } = await supabase
        .from('campaign_contacts')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', c.id)
        .eq('status', 'pendente');

      // Fetch Completed Contacts count
      const { count: completed } = await supabase
        .from('campaign_contacts')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', c.id)
        .in('status', ['concluido', 'completed']);

      return {
        id: c.id,
        name: c.nome,
        institution: c.instituicao || '',
        type: (c.tipo_telefonia === 'whatsapp' ? 'WhatsApp' : 'VAPI') as 'VAPI' | 'WhatsApp',
        status: c.status || (c.ativa ? 'active' : 'paused'),  // Use database status, fallback to ativa
        totalContacts: total || 0,
        pendingContacts: pending || 0,
        completedContacts: completed || 0,
        successRate: total ? Math.round(((completed || 0) / total) * 100) : 0,
        active: c.ativa,
        vapi_assistant_id: c.assistant_vapi_id,
        vapi_phone_id: c.linha_vapi_id,
        maxAttempts: c.max_tentativas,
        intervalMinutes: c.intervalo_minutos,
        startTime: c.janela_inicio ? c.janela_inicio.slice(0, 5) : '',
        endTime: c.janela_fim ? c.janela_fim.slice(0, 5) : '',
        created_at: c.created_at,
        description: c.descricao,
        simultaneousCalls: c.ligacoes_simultaneas
      };
    }));

    return enrichedCampaigns;
  },

  async createCampaign(campaignData: Partial<Campaign>): Promise<Campaign | null> {
    const dbPayload = {
      nome: campaignData.name,
      instituicao: campaignData.institution,
      tipo_telefonia: campaignData.type?.toLowerCase(),
      ativa: campaignData.active,
      assistant_vapi_id: campaignData.vapi_assistant_id,
      linha_vapi_id: campaignData.vapi_phone_id,
      max_tentativas: campaignData.maxAttempts,
      intervalo_minutos: campaignData.intervalMinutes,
      janela_inicio: campaignData.startTime,
      janela_fim: campaignData.endTime,
      descricao: campaignData.description || '',
      ligacoes_simultaneas: campaignData.simultaneousCalls || 1
    };

    const { data, error } = await supabase
      .from('campaigns')
      .insert([dbPayload])
      .select()
      .single();

    if (error) {
      console.error('Error creating campaign:', error);
      throw error;
    }

    return data;
  },

  async updateCampaign(id: string, campaignData: Partial<Campaign>): Promise<void> {
    const dbPayload = {
      nome: campaignData.name,
      instituicao: campaignData.institution,
      tipo_telefonia: campaignData.type?.toLowerCase(),
      assistant_vapi_id: campaignData.vapi_assistant_id,
      linha_vapi_id: campaignData.vapi_phone_id,
      max_tentativas: campaignData.maxAttempts,
      intervalo_minutos: campaignData.intervalMinutes,
      janela_inicio: campaignData.startTime,
      janela_fim: campaignData.endTime,
      ligacoes_simultaneas: campaignData.simultaneousCalls
    };

    const { error } = await supabase
      .from('campaigns')
      .update(dbPayload)
      .eq('id', id);

    if (error) {
      console.error('Error updating campaign:', error);
      throw error;
    }
  },

  async toggleCampaignStatus(id: string, isActive: boolean): Promise<void> {
    const { error } = await supabase
      .from('campaigns')
      .update({
        ativa: isActive
      })
      .eq('id', id);

    if (error) {
      console.error('Error toggling campaign:', error);
      throw error;
    }
  },

  // --- CONTACTS ---

  async getContacts(): Promise<Contact[]> {
    const { data, error } = await supabase
      .from('campaign_contacts')
      .select(`
        id,
        status,
        tentativas,
        ultima_tentativa,
        contact_id,
        contacts (
          nome,
          cpf,
          instituicao,
          telefone
        ),
        campaigns (
          id,
          nome
        )
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error fetching contacts:', error);
      throw error;
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      contactId: row.contact_id,
      name: row.contacts?.nome || 'Sem Nome',
      cpf: row.contacts?.cpf || '',
      institution: row.contacts?.instituicao || '',
      campaignId: row.campaigns?.id,
      campaignName: row.campaigns?.nome || 'Campanha Removida',
      status: row.status,
      attempts: row.tentativas,
      lastAttempt: row.ultima_tentativa ? new Date(row.ultima_tentativa).toLocaleString('pt-BR') : undefined,
      phone: row.contacts?.telefone || ''
    }));
  },

  async checkExistingCpfs(cpfs: string[]): Promise<string[]> {
    if (!cpfs || cpfs.length === 0) return [];

    const cleanCpfs = cpfs.map(c => c.replace(/\D/g, '')).filter(Boolean);
    if (cleanCpfs.length === 0) return [];

    const { data, error } = await supabase
      .from('contacts')
      .select('cpf')
      .in('cpf', cleanCpfs);

    if (error) {
      console.error('Error checking duplicates:', error);
      return [];
    }

    return data.map((d: any) => d.cpf);
  },

  /*
  funcao que antes realizava o ETL no completo no frontend, manterei por precuacao comentada por enquanto
  async importContacts(
    campaignId: string,
    contactsData: { nome: string; cpf: string; telefone: string; instituicao: string }[],
    onProgress?: (percent: number, label: string) => void
  ): Promise<void> {
    if (!contactsData || contactsData.length === 0) return;

    const CHUNK = 500; // safe Supabase payload size
    const report = (pct: number, label: string) => onProgress?.(Math.round(pct), label);

    // Helper: split array into chunks
    const chunkArray = <T>(arr: T[], size: number): T[][] =>
      Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, (i + 1) * size));

    // 1. Normalize phones
    report(2, 'Normalizando dados...');
    const contactsPayload = contactsData.map(c => {
      const cleanNums = c.telefone.replace(/\D/g, '');
      const normalizedPhone = (cleanNums.length === 12 || cleanNums.length === 13)
        ? `+${cleanNums}`
        : `+55${cleanNums}`;
      return { nome: c.nome, cpf: c.cpf.replace(/\D/g, ''), instituicao: c.instituicao, telefone: normalizedPhone };
    });

    // 2. Check existing phones in batches (Phase 0â€“25%)
    report(5, 'Verificando duplicatas...');
    const allPhones = contactsPayload.map(c => c.telefone);
    const phoneChunks = chunkArray(allPhones, CHUNK);
    const existingPhoneMap = new Map<string, string>(); // phone -> id

    for (let i = 0; i < phoneChunks.length; i++) {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, telefone')
        .in('telefone', phoneChunks[i]);

      if (error) throw error;
      data?.forEach((c: any) => existingPhoneMap.set(c.telefone, c.id));
      report(5 + ((i + 1) / phoneChunks.length) * 20, `Verificando duplicatas (lote ${i + 1}/${phoneChunks.length})...`);
    }

    // 3. Insert new contacts in batches (Phase 25â€“60%)
    const newContacts = contactsPayload.filter(c => !existingPhoneMap.has(c.telefone));
    const insertChunks = chunkArray(newContacts, CHUNK);

    for (let i = 0; i < insertChunks.length; i++) {
      const { data: inserted, error } = await supabase
        .from('contacts')
        .insert(insertChunks[i])
        .select('id, telefone');

      if (error) throw error;
      inserted?.forEach((c: any) => existingPhoneMap.set(c.telefone, c.id));
      report(25 + ((i + 1) / Math.max(insertChunks.length, 1)) * 35, `Inserindo novos contatos (lote ${i + 1}/${insertChunks.length})...`);
    }

    if (insertChunks.length === 0) report(60, 'Nenhum contato novo para inserir.');

    // 4. Build campaign_contacts payload
    report(62, 'Vinculando Ã  campanha...');
    const campaignPayload: any[] = [];
    const processedIds = new Set<string>();

    for (const c of contactsPayload) {
      const contactId = existingPhoneMap.get(c.telefone);
      if (contactId && !processedIds.has(contactId)) {
        campaignPayload.push({ campaign_id: campaignId, contact_id: contactId, status: 'pendente', tentativas: 0 });
        processedIds.add(contactId);
      }
    }

    // 5. Upsert campaign links in batches (Phase 62â€“100%)
    const linkChunks = chunkArray(campaignPayload, CHUNK);

    for (let i = 0; i < linkChunks.length; i++) {
      const { error: upsertErr } = await supabase
        .from('campaign_contacts')
        .upsert(linkChunks[i], { onConflict: 'campaign_id,contact_id', ignoreDuplicates: true });

      if (upsertErr) {
        console.warn('Upsert falhou, tentando insert simples...', upsertErr);
        const { error: insertErr } = await supabase.from('campaign_contacts').insert(linkChunks[i]);
        if (insertErr && !insertErr.message.includes('duplicate')) throw insertErr;
      }

      report(62 + ((i + 1) / linkChunks.length) * 38, `Vinculando contatos (lote ${i + 1}/${linkChunks.length})...`);
    }

    report(100, 'ImportaÃ§Ã£o concluÃ­da!');
  },
  */

  //redireciona payload para a Edge Function para o ETL no servidor
  async importContacts(
  campaignId: string,
  contactsData: {
    nome: string;
    cpf: string;
    telefone: string;
    instituicao: string;
  }[],
  onProgress?: (percent: number, label: string) => void
  ): Promise<any> {

    if (!contactsData || contactsData.length === 0) return;

    onProgress?.(5, 'Enviando dados para processamento...');

    let data: any;
    try {
      data = await apiRequest<any>('/api/contacts/import', {
        method: 'POST',
        body: JSON.stringify({
          campaignId,
          contacts: contactsData
        })
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (!message.includes('404')) throw error;

      console.warn('[contacts/import] endpoint /api/contacts/import retornou 404; usando fallback Supabase client.');
      onProgress?.(10, 'Endpoint indisponivel. Importando direto pelo Supabase...');
      data = await importContactsDirectly(campaignId, contactsData, onProgress);
    }

    onProgress?.(100, 'ImportaÃ§Ã£o concluÃ­da.');

    return data;
  },

  // --- ACTIONS (New) ---

  async resetContactAttempts(campaignContactId: string): Promise<void> {
    const { error } = await supabase
      .from('campaign_contacts')
      .update({
        tentativas: 0,
        status: 'pendente',
        ultima_tentativa: null
      })
      .eq('id', campaignContactId);

    if (error) {
      console.error('Error resetting contact:', error);
      throw error;
    }
  },

  async deleteContact(campaignContactId: string): Promise<void> {
    const { error } = await supabase
      .from('campaign_contacts')
      .delete()
      .eq('id', campaignContactId);

    if (error) {
      console.error('Error deleting contact:', error);
      throw error;
    }
  },

  async updateContact(contactId: string, data: { nome?: string; telefone?: string; cpf?: string }): Promise<void> {
    // Note: This updates the PERSON (contacts table), not just the campaign link

    // Normalize data before updating
    const normalizedData: any = {};

    if (data.nome !== undefined) {
      normalizedData.nome = data.nome;
    }

    if (data.telefone !== undefined) {
      // Normalize phone: remove non-digits and add +55 if needed
      const cleanNums = data.telefone.replace(/\D/g, '');
      normalizedData.telefone = (cleanNums.length === 12 || cleanNums.length === 13)
        ? `+${cleanNums}`
        : `+55${cleanNums}`;
    }

    if (data.cpf !== undefined) {
      // Normalize CPF: remove non-digits
      normalizedData.cpf = data.cpf.replace(/\D/g, '');
    }

    const { error } = await supabase
      .from('contacts')
      .update(normalizedData)
      .eq('id', contactId);

    if (error) {
      console.error('Error updating contact:', error);
      throw error;
    }
  },

  // --- CALLS ---

  async getCalls(): Promise<Call[]> {
    const data = await apiRequest<Call[]>('/api/calls?history=true');
    return data || [];
  },

  async getCall(id: string): Promise<Call> {
    return apiRequest<Call>(`/api/calls/${id}`);
  },

  // --- SETTINGS (DB) ---

  async getSettingsFromDb(): Promise<Record<string, string>> {
    const { data } = await supabase.from('app_settings').select('setting_key, setting_value');
    if (!data) return {};
    return data.reduce((acc: any, curr: any) => {
      acc[curr.setting_key] = curr.setting_value;
      return acc;
    }, {});
  },

  async saveSettingToDb(key: string, value: string): Promise<void> {
    const { error } = await supabase.from('app_settings').upsert(
      { setting_key: key, setting_value: value },
      { onConflict: 'setting_key' }
    );
    if (error) console.error(`Error saving setting ${key}:`, error);
  },

  // --- REPORTS (Views) ---

  async getReportKPIs(): Promise<any> {
    const { data, error } = await supabase
      .from('vw_report_kpis')
      .select('*')
      .single();

    if (error) {
      console.error('Error fetching report KPIs:', error);
      return {
        total_calls: 0,
        contacted_calls: 0,
        contact_rate_percent: 0,
        successful_calls: 0,
        success_rate_percent: 0,
        avg_duration_seconds: 0,
        total_cost: 0
      };
    }

    return data;
  },

  async getReportFunnel(): Promise<any[]> {
    const { data, error } = await supabase
      .from('vw_report_funnel')
      .select('*');

    if (error) {
      console.error('Error fetching report funnel:', error);
      return [];
    }

    return data || [];
  },

  async getReportTerminationReasons(): Promise<any[]> {
    const { data, error } = await supabase
      .from('vw_report_termination_reasons')
      .select('*');

    if (error) {
      console.error('Error fetching termination reasons:', error);
      return [];
    }

    return data || [];
  },

  async getReportDailyActivity(): Promise<any[]> {
    const { data, error } = await supabase
      .from('vw_report_daily_activity')
      .select('*');

    if (error) {
      console.error('Error fetching daily activity:', error);
      return [];
    }

    return data || [];
  },

  async getReportDailyCosts(): Promise<any[]> {
    const { data, error } = await supabase
      .from('vw_report_daily_costs')
      .select('*');

    if (error) {
      console.error('Error fetching daily costs:', error);
      return [];
    }

    return data || [];
  },

  // --- KPI ACORDOS ---

  async getAcordosKPIs(): Promise<AcordoKpi[]> {
    const { data: kpis, error: kpisError } = await supabase
      .from('vw_acordos_kpis')
      .select('*')
      .order('referencia_data', { ascending: false })
      .limit(2000);

    if (kpisError) {
      console.error('Error fetching acordo KPIs:', kpisError);
      throw kpisError;
    }

    const { data: formalizados, error: formalizadosError } = await supabase
      .from('acordos_formalizados')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5000);

    if (formalizadosError) {
      console.error('Error fetching acordos formalizados:', formalizadosError);
      throw formalizadosError;
    }

    const normalizeText = (value: unknown) =>
      String(value || '')
        .trim()
        .toLowerCase();
    const normalizeCpf = (value: unknown) => String(value || '').replace(/\D/g, '');
    const normalizeUrl = (value: unknown) =>
      String(value || '')
        .trim()
        .replace(/^https?:\/\//i, '')
        .replace(/\/+$/, '')
        .toLowerCase();
    const getDateOnly = (value: unknown) => {
      const str = String(value || '');
      return str.length >= 10 ? str.slice(0, 10) : '';
    };
    const addDays = (date: string, days: number) => {
      const parsed = new Date(`${date}T00:00:00.000Z`);
      parsed.setUTCDate(parsed.getUTCDate() + days);
      return parsed.toISOString().slice(0, 10);
    };
    const hasAgreementPhrase = (call: any) => {
      const searchable = [
        call.transcript,
        call.summary,
        call.metadata_raw ? JSON.stringify(call.metadata_raw) : ''
      ].join(' ').toLowerCase();

      return searchable.includes('acordo formalizado');
    };
    const firstNonEmpty = (...values: unknown[]) => {
      for (const value of values) {
        if (value === null || value === undefined) continue;
        const str = String(value).trim();
        if (str) return str;
      }
      return '';
    };
    const getAgreementRecordingUrl = (agreement: any) =>
      firstNonEmpty(
        agreement.recording_url,
        agreement.recordingUrl,
        agreement.url,
        agreement['url '],
        agreement.audio_url,
        agreement.audio,
        agreement.stereo_recording_url,
        agreement.stereoRecordingUrl
      );
    const assistantNamesById = new Map<string, string>();
    try {
      const resources = await apiRequest<{ assistants?: Array<{ id?: string; name?: string; model?: { model?: string } }> }>(
        '/api/vapi/resources',
        { method: 'GET' }
      );
      (resources.assistants || []).forEach((assistant) => {
        if (!assistant.id) return;
        const name = firstNonEmpty(assistant.name, assistant.model?.model);
        if (name) assistantNamesById.set(assistant.id, name);
      });
    } catch (resourceError) {
      console.warn('[acordos-kpis] nao foi possivel buscar nomes dos assistentes VAPI:', resourceError);
    }
    const resolveAgentName = (value: unknown) => {
      const str = firstNonEmpty(value);
      return str ? assistantNamesById.get(str) || str : '';
    };
    const getResponsibleAgent = (agreement: any, call: any) => {
      const candidates = [
        agreement.agente_responsavel,
        agreement.responsavel,
        agreement.responsavel_acordo,
        agreement.agente,
        agreement.agent_name,
        agreement.agent,
        agreement.assistant_name,
        call?.assistant_id
      ];

      for (const candidate of candidates) {
        const resolved = resolveAgentName(candidate);
        if (resolved) return resolved;
      }

      return '';
    };
    const buildKeys = (row: any, referenceDate: string) =>
      [
        row.campaign_id ? `${row.campaign_id}|${referenceDate}` : '',
        row.campanha ? `${normalizeText(row.campanha)}|${referenceDate}` : ''
      ].filter(Boolean);

    const formalizadosRows = formalizados || [];
    const agreementRecordingUrls = Array.from(
      new Set(formalizadosRows.map((row: any) => normalizeUrl(getAgreementRecordingUrl(row))).filter(Boolean))
    );

    const callsByRecordingUrl = new Map<string, any>();
    const productionAgreementCalls: any[] = [];
    const kpiRows = kpis || [];
    const referenceDates = Array.from(
      new Set(
        [
          ...kpiRows.map((row: any) => getDateOnly(row.referencia_data)),
          ...formalizadosRows.map((row: any) => getDateOnly(row.created_at))
        ].filter(Boolean)
      )
    ).sort();
    const campaignNames = Array.from(
      new Set(
        [
          ...kpiRows.map((row: any) => normalizeText(row.campanha_nome)),
          ...formalizadosRows.map((row: any) => normalizeText(row.campanha))
        ].filter(Boolean)
      )
    );

    if (referenceDates.length > 0) {
      const { data: phraseCallRows, error: phraseCallRowsError } = await supabase
        .from('calls')
        .select(
          'id, vapi_call_id, assistant_id, campanha, cpf, cliente, customer_number, started_at, ended_at, duration_seconds, status, ended_reason, recording_url, stereo_recording_url, transcript, summary, metadata_raw, custo_total, custo_stt, custo_tts, custo_vapi'
        )
        .not('recording_url', 'is', null)
        .gte('started_at', `${referenceDates[0]}T00:00:00.000Z`)
        .lt('started_at', `${addDays(referenceDates[referenceDates.length - 1], 1)}T00:00:00.000Z`)
        .order('started_at', { ascending: false })
        .limit(10000);

      if (phraseCallRowsError) {
        console.error('Error fetching production agreement calls:', phraseCallRowsError);
        throw phraseCallRowsError;
      }

      (phraseCallRows || [])
        .filter((call: any) => campaignNames.length === 0 || campaignNames.includes(normalizeText(call.campanha)))
        .filter(hasAgreementPhrase)
        .forEach((call: any) => {
          productionAgreementCalls.push(call);

          const recordingUrl = normalizeUrl(call.recording_url);
          const stereoRecordingUrl = normalizeUrl(call.stereo_recording_url);
          if (recordingUrl) callsByRecordingUrl.set(recordingUrl, call);
          if (stereoRecordingUrl) callsByRecordingUrl.set(stereoRecordingUrl, call);
        });
    }

    for (const urlChunk of chunkArray(agreementRecordingUrls, 100)) {
      const orExpr = urlChunk
        .flatMap((url) => [
          `recording_url.ilike.%${url}%`,
          `stereo_recording_url.ilike.%${url}%`
        ])
        .join(',');
      const { data: callRows, error: callRowsError } = await supabase
        .from('calls')
        .select(
          'id, vapi_call_id, assistant_id, campanha, cpf, cliente, customer_number, started_at, ended_at, duration_seconds, status, ended_reason, recording_url, stereo_recording_url, transcript, summary, custo_total, custo_stt, custo_tts, custo_vapi'
        )
        .or(orExpr)
        .order('started_at', { ascending: false })
        .limit(10000);

      if (callRowsError) {
        console.error('Error fetching acordo call recordings by URL:', callRowsError);
        throw callRowsError;
      }

      (callRows || []).forEach((call: any) => {
        const recordingUrl = normalizeUrl(call.recording_url);
        const stereoRecordingUrl = normalizeUrl(call.stereo_recording_url);
        if (recordingUrl) callsByRecordingUrl.set(recordingUrl, call);
        if (stereoRecordingUrl) callsByRecordingUrl.set(stereoRecordingUrl, call);
      });
    }

    const findMatchingCall = (agreement: any) => {
      const recordingUrl = normalizeUrl(getAgreementRecordingUrl(agreement));
      return recordingUrl ? callsByRecordingUrl.get(recordingUrl) || null : null;
    };

    const formalizadosByCampaignDate = new Map<
      string,
      {
        count: number;
        value: number;
        recordings: NonNullable<AcordoKpi['acordo_recordings']>;
        calls: NonNullable<AcordoKpi['acordo_calls']>;
        agents: string[];
      }
    >();
    const getGroup = (key: string) =>
      formalizadosByCampaignDate.get(key) || { count: 0, value: 0, recordings: [], calls: [], agents: [] };
    const upsertGroup = (
      key: string,
      patch: Partial<{
        count: number;
        value: number;
        recordings: NonNullable<AcordoKpi['acordo_recordings']>;
        calls: NonNullable<AcordoKpi['acordo_calls']>;
        agents: string[];
      }>
    ) => {
      const current = getGroup(key);
      formalizadosByCampaignDate.set(key, {
        count: patch.count ?? current.count,
        value: patch.value ?? current.value,
        recordings: patch.recordings ?? current.recordings,
        calls: patch.calls ?? current.calls,
        agents: patch.agents ?? current.agents
      });
    };

    formalizadosRows.forEach((row: any) => {
      const referenceDate = row.created_at ? String(row.created_at).slice(0, 10) : '';
      if (!referenceDate) return;

      const keys = buildKeys(row, referenceDate);
      if (keys.length === 0) return;

      const cpf = normalizeCpf(row.cpf);
      const matchingCall = findMatchingCall(row);
      const agenteResponsavel = getResponsibleAgent(row, matchingCall);
      const recording = matchingCall
        ? {
            acordo_id: row.id,
            call_id: matchingCall.id,
            vapi_call_id: matchingCall.vapi_call_id,
            assistant_id: matchingCall.assistant_id,
            agente_responsavel: agenteResponsavel,
            cpf,
            nome: row.nome || matchingCall.cliente,
            recording_url: matchingCall.recording_url,
            stereo_recording_url: matchingCall.stereo_recording_url
          }
        : null;
      const callDetail = matchingCall
        ? {
            acordo_id: row.id,
            call_id: matchingCall.id,
            vapi_call_id: matchingCall.vapi_call_id,
            assistant_id: matchingCall.assistant_id,
            agente_responsavel: agenteResponsavel,
            cpf,
            nome: row.nome || matchingCall.cliente,
            telefone: matchingCall.customer_number,
            campanha: matchingCall.campanha,
            started_at: matchingCall.started_at,
            ended_at: matchingCall.ended_at,
            duration_seconds: Number(matchingCall.duration_seconds || 0),
            status: matchingCall.status,
            ended_reason: matchingCall.ended_reason,
            recording_url: matchingCall.recording_url,
            stereo_recording_url: matchingCall.stereo_recording_url,
            transcript: matchingCall.transcript,
            summary: matchingCall.summary,
            custo_total: Number(matchingCall.custo_total || 0),
            custo_stt: Number(matchingCall.custo_stt || 0),
            custo_tts: Number(matchingCall.custo_tts || 0),
            custo_vapi: Number(matchingCall.custo_vapi || 0)
          }
        : null;
      const value = Number(row.valor_recuperado || 0);

      keys.forEach((key) => {
        const current = getGroup(key);
        upsertGroup(key, {
          count: current.count + 1,
          value: current.value + (Number.isFinite(value) ? value : 0),
          recordings: recording ? [...current.recordings, recording] : current.recordings,
          calls: callDetail ? [...current.calls, callDetail] : current.calls,
          agents: agenteResponsavel ? [...current.agents, agenteResponsavel] : current.agents
        });
      });
    });

    productionAgreementCalls.forEach((matchingCall, index) => {
      const referenceDate = getDateOnly(matchingCall.started_at);
      if (!referenceDate) return;

      const key = `${normalizeText(matchingCall.campanha)}|${referenceDate}`;
      const current = getGroup(key);
      if (current.count > 0) return;

      const matchingRecordingUrl = normalizeUrl(matchingCall.recording_url);
      const alreadyAdded = current.calls.some((call) => normalizeUrl(call.recording_url) === matchingRecordingUrl);
      if (alreadyAdded) return;

      const agenteResponsavel = getResponsibleAgent({}, matchingCall);
      const cpf = normalizeCpf(matchingCall.cpf);
      const callDetail = {
        acordo_id: `producao-acordo-formalizado-${index}`,
        call_id: matchingCall.id,
        vapi_call_id: matchingCall.vapi_call_id,
        assistant_id: matchingCall.assistant_id,
        agente_responsavel: agenteResponsavel,
        cpf,
        nome: matchingCall.cliente,
        telefone: matchingCall.customer_number,
        campanha: matchingCall.campanha,
        started_at: matchingCall.started_at,
        ended_at: matchingCall.ended_at,
        duration_seconds: Number(matchingCall.duration_seconds || 0),
        status: matchingCall.status,
        ended_reason: matchingCall.ended_reason,
        recording_url: matchingCall.recording_url,
        stereo_recording_url: matchingCall.stereo_recording_url,
        transcript: matchingCall.transcript,
        summary: matchingCall.summary,
        custo_total: Number(matchingCall.custo_total || 0),
        custo_stt: Number(matchingCall.custo_stt || 0),
        custo_tts: Number(matchingCall.custo_tts || 0),
        custo_vapi: Number(matchingCall.custo_vapi || 0)
      };
      const recording = {
        acordo_id: callDetail.acordo_id,
        call_id: matchingCall.id,
        vapi_call_id: matchingCall.vapi_call_id,
        assistant_id: matchingCall.assistant_id,
        agente_responsavel: agenteResponsavel,
        cpf,
        nome: callDetail.nome,
        recording_url: matchingCall.recording_url,
        stereo_recording_url: matchingCall.stereo_recording_url
      };

      upsertGroup(key, {
        recordings: [...current.recordings, recording],
        calls: [...current.calls, callDetail],
        agents: agenteResponsavel ? [...current.agents, agenteResponsavel] : current.agents
      });
    });

    return (kpis || []).map((row: any) => {
      const key = `${row.campaign_id}|${row.referencia_data}`;
      const fallbackKey = `${normalizeText(row.campanha_nome)}|${row.referencia_data}`;
      const formalizado = formalizadosByCampaignDate.get(key) ||
        formalizadosByCampaignDate.get(fallbackKey) ||
        { count: 0, value: 0, recordings: [], calls: [], agents: [] };
      const mergedCalls = formalizado.calls;
      const mergedRecordings = formalizado.recordings;
      const agentesResponsaveis = Array.from(
        new Set(
          [
            ...formalizado.agents,
            ...mergedCalls.map((call) => call.agente_responsavel || call.assistant_id)
          ]
            .filter((agent): agent is string => Boolean(agent))
        )
      ).sort((a, b) => a.localeCompare(b));

      return {
        ...row,
        chamadas_discadas: Number(row.chamadas_discadas || 0),
        chamadas_atendidas: Number(row.chamadas_atendidas || 0),
        contatos_efetivos: Number(row.contatos_efetivos || 0),
        acordos_fechados: Number(row.acordos_fechados || 0),
        chamadas_com_falha: Number(row.chamadas_com_falha || 0),
        chamadas_totais: Number(row.chamadas_totais || 0),
        quantidade_ligacoes: Number(row.quantidade_ligacoes || 0),
        tempo_total_ligacoes_segundos: Number(row.tempo_total_ligacoes_segundos || 0),
        custo_operacional: Number(row.custo_operacional || 0),
        valor_recuperado: Number(row.valor_recuperado || 0),
        taxa_conversao: Number(row.taxa_conversao || 0),
        taxa_atendimento: Number(row.taxa_atendimento || 0),
        tma_segundos: Number(row.tma_segundos || 0),
        cpr: Number(row.cpr || 0),
        call_failure_rate: Number(row.call_failure_rate || 0),
        taxa_engajamento: Number(row.taxa_engajamento || 0),
        acordos_formalizados_count: formalizado.count || mergedCalls.length,
        valor_formalizado: formalizado.value,
        acordo_recordings: mergedRecordings,
        acordo_calls: mergedCalls,
        agentes_responsaveis: agentesResponsaveis,
        recording_urls: mergedRecordings
          .map((recording) => recording.recording_url)
          .filter((url): url is string => Boolean(url))
      };
    });
  },

  // --- QUALITY (Views) ---

  async getQualityMetrics(): Promise<any> {
    const { data, error } = await supabase
      .from('vw_quality_metrics')
      .select('*')
      .single();

    if (error) {
      console.error('Error fetching quality metrics:', error);
      return {
        nps_score: 0,
        avg_rating: 0,
        promoters: 0,
        detractors: 0,
        total_rated: 0,
        promoters_percent: 0,
        detractors_percent: 0
      };
    }

    return data;
  },

  async getQualityRatingDistribution(): Promise<any[]> {
    const { data, error } = await supabase
      .from('vw_quality_rating_distribution')
      .select('*');

    if (error) {
      console.error('Error fetching rating distribution:', error);
      return [];
    }

    return data || [];
  },

  async getQualityByCampaign(): Promise<any[]> {
    const { data, error } = await supabase
      .from('vw_quality_by_campaign')
      .select('*');

    if (error) {
      console.error('Error fetching quality by campaign:', error);
      return [];
    }

    return data || [];
  },

  async getQualityTopObjections(): Promise<any[]> {
    // Instead of using the view (which returns long summaries), we fetch recent failed calls and categorize them manually
    const { data, error } = await supabase
      .from('calls')
      .select('analysis, summary, ended_reason')
      .eq('success_evaluation', 'false') // Stored as text in the current schema
      .order('started_at', { ascending: false })
      .limit(200); // Analyze sample of last 200 calls

    if (error) {
      console.error('Error fetching top objections:', error);
      return [];
    }

    if (!data || data.length === 0) return [];

    const objectionCounts: Record<string, number> = {};

    data.forEach((call: any) => {
      let objection = "Outros";
      const summaryLower = (call.summary || '').toLowerCase();
      const analysisObj = call.analysis || {};
      const reasonLower = (call.ended_reason || '').toLowerCase();

      // 1. Try to find structured objection in VAPI analysis (if available in future)
      if (analysisObj.objection) {
        objection = analysisObj.objection;
      }
      // 2. Keyword Analysis on Summary (Heuristics)
      else if (summaryLower.includes('dinheiro') || summaryLower.includes('caro') || summaryLower.includes('financeir') || summaryLower.includes('custo') || summaryLower.includes('valor') || summaryLower.includes('pagar')) {
        objection = "PreÃ§o / CondiÃ§Ã£o Financeira";
      }
      else if (summaryLower.includes('nÃ£o tem interesse') || summaryLower.includes('desinteress') || summaryLower.includes('nÃ£o quer') || summaryLower.includes('agradece') || summaryLower.includes('nÃ£o precisa')) {
        objection = "Sem Interesse";
      }
      else if (summaryLower.includes('ocupado') || summaryLower.includes('ligar mais tarde') || summaryLower.includes('reuniÃ£o') || summaryLower.includes('trabalha') || summaryLower.includes('ligue') || summaryLower.includes('momento') || summaryLower.includes('agendar')) {
        objection = "Ocupado / Agendar Retorno";
      }
      else if (summaryLower.includes('jÃ¡ possui') || summaryLower.includes('jÃ¡ tem') || summaryLower.includes('concorrente') || summaryLower.includes('outro plano') || summaryLower.includes('jÃ¡ fiz') || summaryLower.includes('resolvi')) {
        objection = "JÃ¡ possui SoluÃ§Ã£o/Concorrente";
      }
      else if (summaryLower.includes('enganado') || summaryLower.includes('nÃ£o Ã©') || summaryLower.includes('erro') || summaryLower.includes('desconhece') || summaryLower.includes('nÃ£o sou')) {
        objection = "Contato Errado / Engano";
      }
      else if (reasonLower.includes('customer-ended')) {
        // Specific VAPI reason when user hangs up interaction
        objection = "Desligou na Cara / Sem InteraÃ§Ã£o";
      }
      else if (summaryLower.includes('caixa postal') || summaryLower.includes('voicemail') || summaryLower.includes('recado') || summaryLower.includes('sinal') || summaryLower.includes('eletrÃ´nica')) {
        objection = "Caixa Postal / NÃ£o Atendeu";
      }
      else if (call.summary && call.summary.length > 5 && call.summary.length < 50) {
        // Short summaries tend to be the objection itself
        objection = call.summary;
      }
      else {
        // If we have a long summary but no keyword hit, and it wasn't a hangup, it's generic
        objection = "ObjeÃ§Ã£o GenÃ©rica (Diversos)";
      }

      // Increment count
      objectionCounts[objection] = (objectionCounts[objection] || 0) + 1;
    });

    // Convert to array and sort
    const sortedObjections = Object.entries(objectionCounts)
      .map(([objection, occurrences]) => ({
        objection,
        occurrences,
        rank: 0 // placeholder
      }))
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, 5); // Top 5

    // Adiciona Rank
    return sortedObjections.map((obj, index) => ({ ...obj, rank: index + 1 }));
  },

  async getQualityRealtimeOverview(): Promise<any> {
    try {
      // 1. Get Latest Call with Transcription for the "Live Box"
      const { data: lastCalls } = await supabase
        .from('calls')
        .select('*')
        .not('transcript', 'is', null) // Must have text
        .neq('transcript', '')
        .order('started_at', { ascending: false })
        .limit(1);

      const lastCall = lastCalls && lastCalls.length > 0 ? lastCalls[0] : null;

      // 2. Sentiment Stats (Proxy: Success = Positive, Fail = Negative/Neutral)
      const { count: totalCalls } = await supabase.from('calls').select('*', { count: 'exact', head: true });
      const { count: successCalls } = await supabase.from('calls').select('*', { count: 'exact', head: true }).eq('success_evaluation', 'true');

      const sentimentPositivePercent = totalCalls ? Math.round(((successCalls || 0) / totalCalls) * 100) : 0;

      // 3. Simple Cluster Count
      const { data: objectionSample } = await supabase
        .from('calls')
        .select('ended_reason')
        .limit(100);

      const uniqueClusters = new Set(objectionSample?.map((c: any) => c.ended_reason)).size || 0;

      return {
        lastCall: lastCall ? {
          transcript: lastCall.summary || lastCall.transcript, // Prefer summary for brevity if available
          objection: lastCall.analysis?.objection || lastCall.ended_reason || 'Desconhecido',
          sentiment: lastCall.success_evaluation ? 'true' : 'false'
        } : null,
        sentimentPositivePercent,
        totalClusters: uniqueClusters
      };
    } catch (error) {
      console.error('Error fetching realtime overview:', error);
      return { lastCall: null, sentimentPositivePercent: 0, totalClusters: 0 };
    }
  }
};
