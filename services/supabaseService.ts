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

  async importContacts(campaignId: string, contactsData: { nome: string; cpf: string; telefone: string; instituicao: string }[]): Promise<void> {
    if (!contactsData || contactsData.length === 0) return;

    const contactsPayload = contactsData.map(c => ({
      nome: c.nome,
      cpf: c.cpf.replace(/\D/g, ''),
      instituicao: c.instituicao,
      telefone: (() => {
        const cleanParams = c.telefone.replace(/\D/g, '');
        // If it already has 12 or 13 digits (55 + DDD + Num), assume it's full. 
        // Otherwise if 10 or 11 (DDD + Num), add +55.
        if (cleanParams.length === 12 || cleanParams.length === 13) return `+${cleanParams}`;
        return `+55${cleanParams}`;
      })()
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
        // Use trigger-populated fields first, fallback to JOIN data
        campaignName: call.campaign_name || call.campaign_contacts?.campaigns?.nome || 'Direta',
        clientName: call.cliente || call.campaign_contacts?.contacts?.nome || 'Desconhecido',
        cpf: call.cpf || call.campaign_contacts?.contacts?.cpf || '-',
        phone: call.customer_number || call.campaign_contacts?.contacts?.telefone || '-',
        duration: durationFormatted,
        status: call.status === 'completed' ? 'Concluída' : 'Falhou',
        reason: call.ended_reason || '-',
        success: call.success_evaluation === 'true' || call.success_evaluation === true || false,
        cost: Number(call.custo_total) || 0,
        // Add detailed costs
        custo_stt: Number(call.custo_stt) || 0,
        custo_tts: Number(call.custo_tts) || 0,
        custo_vapi: Number(call.custo_vapi) || 0,
        custo_total: Number(call.custo_total) || 0,
        recordingUrl: call.recording_url,
        stereoRecordingUrl: call.stereo_recording_url,
        transcript: call.transcript,
        summary: call.summary,
        // Add structured data fields
        structured_name: call.structured_name,
        structured_rating_label: call.structured_rating_label,
        structured_rating_text: call.structured_rating_text,
        structured_purpose: call.structured_purpose,
        structured_main_points: call.structured_main_points,
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
      .eq('success_evaluation', false) // Only look at failed calls (objections)
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
        objection = "Preço / Condição Financeira";
      }
      else if (summaryLower.includes('não tem interesse') || summaryLower.includes('desinteress') || summaryLower.includes('não quer') || summaryLower.includes('agradece') || summaryLower.includes('não precisa')) {
        objection = "Sem Interesse";
      }
      else if (summaryLower.includes('ocupado') || summaryLower.includes('ligar mais tarde') || summaryLower.includes('reunião') || summaryLower.includes('trabalha') || summaryLower.includes('ligue') || summaryLower.includes('momento') || summaryLower.includes('agendar')) {
        objection = "Ocupado / Agendar Retorno";
      }
      else if (summaryLower.includes('já possui') || summaryLower.includes('já tem') || summaryLower.includes('concorrente') || summaryLower.includes('outro plano') || summaryLower.includes('já fiz') || summaryLower.includes('resolvi')) {
        objection = "Já possui Solução/Concorrente";
      }
      else if (summaryLower.includes('enganado') || summaryLower.includes('não é') || summaryLower.includes('erro') || summaryLower.includes('desconhece') || summaryLower.includes('não sou')) {
        objection = "Contato Errado / Engano";
      }
      else if (reasonLower.includes('customer-ended')) {
        // Specific VAPI reason when user hangs up interaction
        objection = "Desligou na Cara / Sem Interação";
      }
      else if (summaryLower.includes('caixa postal') || summaryLower.includes('voicemail') || summaryLower.includes('recado') || summaryLower.includes('sinal') || summaryLower.includes('eletrônica')) {
        objection = "Caixa Postal / Não Atendeu";
      }
      else if (call.summary && call.summary.length > 5 && call.summary.length < 50) {
        // Short summaries tend to be the objection itself
        objection = call.summary;
      }
      else {
        // If we have a long summary but no keyword hit, and it wasn't a hangup, it's generic
        objection = "Objeção Genérica (Diversos)";
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
      const { count: successCalls } = await supabase.from('calls').select('*', { count: 'exact', head: true }).eq('success_evaluation', true);

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