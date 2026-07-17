export type CallDispatchSource = 'manual' | 'campaign';

export interface CallDispatchPayload {
  type: 'call.dispatch';
  source: CallDispatchSource;
  contactId: string | null;
  campaignContactId: string | null;
  campaignId: string;
  phoneId: string | null;
  customerNumber: string;
  customerName: string;
  customerCpf: string | null;
  assistantId: string | null;
  phoneNumberId: string | null;
  callbackUrl: string;
  tipoTelefonia: string;
  queuedAt: string;
}
