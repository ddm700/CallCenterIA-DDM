import { supabase } from '../lib/supabaseClient';
import { Campaign, Contact, Call } from '../types';

export const supabaseService = {
  
  // --- CAMPAIGNS ---

  async getCampaigns(): Promise<Campaign[]> {
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
        status: c.ativa ? 'active' : 'paused',
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

  async importContacts(campaignId: string, contactsData: { nome: string; cpf: string; telefone: string; instituicao: string }[]): Promise<void> {
    if (!contactsData || contactsData.length === 0) return;
    
    const contactsPayload = contactsData.map(c => ({
      nome: c.nome,
      cpf: c.cpf.replace(/\D/g, ''),
      instituicao: c.instituicao,
      telefone: c.telefone
    }));

    const { data: insertedContacts, error: insertError } = await supabase
      .from('contacts')
      .insert(contactsPayload)
      .select('id, cpf');

    if (insertError) {
      console.error('Error inserting contacts:', insertError);
      throw insertError;
    }

    if (!insertedContacts) return;
    
    const campaignContactsPayload = [];
    
    const insertedMap: Record<string, string[]> = {};
    insertedContacts.forEach((c: any) => {
      if (!insertedMap[c.cpf]) insertedMap[c.cpf] = [];
      insertedMap[c.cpf].push(c.id);
    });

    for (const inputContact of contactsData) {
      const cleanCpf = inputContact.cpf.replace(/\D/g, '');
      const availableIds = insertedMap[cleanCpf];
      
      if (availableIds && availableIds.length > 0) {
        const contactId = availableIds.shift(); 
        
        campaignContactsPayload.push({
          campaign_id: campaignId,
          contact_id: contactId,
          status: 'pendente',
          tentativas: 0
        });
      }
    }

    if (campaignContactsPayload.length > 0) {
      const { error: linkError } = await supabase
        .from('campaign_contacts')
        .insert(campaignContactsPayload);

      if (linkError) {
        console.error('Error linking contacts to campaign:', linkError);
        throw linkError;
      }
    }
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

  async updateContact(contactId: string, data: { nome?: string; telefone?: string }): Promise<void> {
    // Note: This updates the PERSON (contacts table), not just the campaign link
    const { error } = await supabase
      .from('contacts')
      .update(data)
      .eq('id', contactId);

    if (error) {
      console.error('Error updating contact:', error);
      throw error;
    }
  },

  // --- CALLS ---

  async getCalls(): Promise<Call[]> {
    const { data, error } = await supabase
      .from('calls')
      .select(`
        *,
        campaign_contacts (
          contacts (
            nome,
            cpf,
            telefone
          ),
          campaigns (
            nome
          )
        )
      `)
      .order('started_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching calls:', error);
      throw error;
    }

    return (data || []).map((call: any) => {
      const durationSeconds = call.duration_seconds || 0;
      const minutes = Math.floor(durationSeconds / 60);
      const seconds = durationSeconds % 60;
      const durationFormatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      
      return {
        id: call.id,
        vapiCallId: call.vapi_call_id,
        date: call.started_at ? new Date(call.started_at).toLocaleString('pt-BR') : '-',
        campaignName: call.campaign_contacts?.campaigns?.nome || 'Direta',
        clientName: call.campaign_contacts?.contacts?.nome || 'Desconhecido',
        cpf: call.campaign_contacts?.contacts?.cpf, 
        phone: call.campaign_contacts?.contacts?.telefone || call.customer_number || '-',
        duration: durationFormatted,
        status: call.status === 'completed' ? 'Concluída' : 'Falhou', 
        reason: call.ended_reason || '-',
        success: call.success_evaluation === 'true' || false, 
        cost: Number(call.custo_total) || 0,
        recordingUrl: call.recording_url,
        transcript: call.transcript,
        summary: call.summary,
        analysis: call.analysis 
      };
    });
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
  }
};