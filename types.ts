
export type CampaignStatus = 'active' | 'paused' | 'completed' | 'draft';
export type ContactStatus = 'pendente' | 'em_andamento' | 'concluido' | 'falhou';

export interface Campaign {
  id: string;
  name: string; // db: nome
  institution: string; // db: instituicao
  type: 'VAPI' | 'WhatsApp'; // db: tipo_telefonia
  status: CampaignStatus; // derived from ativa

  // Calculated fields (from joins or counts)
  totalContacts?: number;
  pendingContacts?: number;
  completedContacts?: number;
  successRate?: number;

  active: boolean; // db: ativa

  // VAPI specific fields
  vapi_assistant_id?: string; // db: assistant_vapi_id
  vapi_phone_id?: string; // db: linha_vapi_id

  maxAttempts: number; // db: max_tentativas
  intervalMinutes: number; // db: intervalo_minutos
  startTime: string; // db: janela_inicio
  endTime: string; // db: janela_fim
  created_at?: string;

  // New fields from schema
  description?: string;
  simultaneousCalls?: number;
}

export interface Contact {
  id: string; // campaign_contact_id
  contactId: string; // contact_id
  name: string; // from contacts.nome
  cpf: string; // from contacts.cpf
  institution: string;
  campaignId: string;
  campaignName: string;
  status: string; // db: status
  attempts: number; // db: tentativas
  lastAttempt?: string; // db: ultima_tentativa
  phone: string; // from contacts.telefone
}

export interface Call {
  id: string;
  vapiCallId?: string;
  date: string; // started_at
  campaignName: string;
  clientName: string;
  cpf?: string;
  phone: string;
  duration: string; // duration_seconds formatted
  status: 'Concluída' | 'Falhou' | 'Em andamento';
  reason: string; // ended_reason
  success: boolean; // derived or success_evaluation
  cost: number; // custo_total
  // Detailed costs
  custo_stt?: number;
  custo_tts?: number;
  custo_vapi?: number;
  custo_total?: number;
  // Recording URLs
  recordingUrl?: string;
  stereoRecordingUrl?: string;
  // Transcription and analysis
  transcript?: string;
  summary?: string;
  // Structured data from VAPI
  structured_name?: string;
  structured_rating_label?: string;
  structured_rating_text?: string;
  structured_purpose?: string;
  structured_main_points?: string;
  analysis?: any; // JSON object from VAPI containing detailed extraction
  // Raw data from DB
  metadata_raw?: any;       // full JSON from metadata_raw column
  raw_summary?: string;     // extracted from metadata_raw.analysis.summary or metadata_raw.summary
  raw_success_evaluation?: string; // extracted from metadata_raw.analysis.successEvaluation
}

export interface AcordoCallDetail {
  acordo_id: string;
  call_id?: string;
  vapi_call_id?: string;
  assistant_id?: string;
  agente_responsavel?: string;
  cpf?: string;
  nome?: string;
  telefone?: string;
  campanha?: string;
  started_at?: string;
  ended_at?: string;
  duration_seconds?: number;
  status?: string;
  ended_reason?: string;
  recording_url?: string;
  stereo_recording_url?: string;
  transcript?: string;
  summary?: string;
  custo_total?: number;
  custo_stt?: number;
  custo_tts?: number;
  custo_vapi?: number;
}

export interface AcordoKpi {
  id: string;
  campaign_id: string;
  campanha_nome: string;
  campanha_instituicao?: string;
  referencia_data: string;
  chamadas_discadas: number;
  chamadas_atendidas: number;
  contatos_efetivos: number;
  acordos_fechados: number;
  chamadas_com_falha: number;
  chamadas_totais: number;
  quantidade_ligacoes: number;
  tempo_total_ligacoes_segundos: number;
  custo_operacional: number;
  valor_recuperado: number;
  taxa_conversao: number;
  taxa_atendimento: number;
  tma_segundos: number;
  cpr: number;
  call_failure_rate: number;
  taxa_engajamento: number;
  created_at?: string;
  updated_at?: string;
  acordos_formalizados_count?: number;
  valor_formalizado?: number;
  recording_urls?: string[];
  acordo_recordings?: Array<{
    acordo_id: string;
    call_id?: string;
    vapi_call_id?: string;
    assistant_id?: string;
    agente_responsavel?: string;
    cpf?: string;
    nome?: string;
    recording_url?: string;
    stereo_recording_url?: string;
  }>;
  acordo_calls?: AcordoCallDetail[];
  agentes_responsaveis?: string[];
}

export interface Metric {
  label: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon?: any;
}

// --- VAPI API Types ---
export interface VapiAssistant {
  id: string;
  name?: string;
  model?: {
    model: string;
  };
}

export interface VapiPhoneNumber {
  id: string;
  number: string;
  name?: string;
  provider?: string;
}

// --- System Logs ---
export interface LogEntry {
  id: string;
  timestamp: string; // ISO String
  level: 'info' | 'warn' | 'error' | 'success';
  category: string; // e.g., 'Import', 'Campaign', 'n8n', 'Database'
  message: string;
  details?: any; // JSON object for debugging
}
