
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
  phone: string; // from contact_phones or contacts
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