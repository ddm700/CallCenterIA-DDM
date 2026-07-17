import { env } from '../config/env.js';
import { publishJson } from './rabbitmq.js';
import type { CallDispatchPayload, CallDispatchSource } from './types.js';

export interface BuildCallDispatchPayloadInput {
  source: CallDispatchSource;
  contactId?: string | null;
  campaignContactId?: string | null;
  campaignId: string;
  phoneId?: string | null;
  customerNumber: string;
  customerName: string;
  customerCpf?: string | null;
  assistantId?: string | null;
  phoneNumberId?: string | null;
  callbackUrl: string;
  tipoTelefonia: string;
}

export function buildCallDispatchPayload(input: BuildCallDispatchPayloadInput): CallDispatchPayload {
  return {
    type: 'call.dispatch',
    source: input.source,
    contactId: input.contactId ?? null,
    campaignContactId: input.campaignContactId ?? null,
    campaignId: input.campaignId,
    phoneId: input.phoneId ?? null,
    customerNumber: input.customerNumber,
    customerName: input.customerName,
    customerCpf: input.customerCpf ?? null,
    assistantId: input.assistantId ?? null,
    phoneNumberId: input.phoneNumberId ?? null,
    callbackUrl: input.callbackUrl,
    tipoTelefonia: input.tipoTelefonia,
    queuedAt: new Date().toISOString()
  };
}

export async function enqueueCallDispatch(payload: CallDispatchPayload): Promise<void> {
  await publishJson(env.rabbitmqCallDispatchQueue, payload);
}
