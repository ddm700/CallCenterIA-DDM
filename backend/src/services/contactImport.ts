import { supabaseAdmin } from '../lib/supabase.js';

const CHUNK_SIZE = 300;

export type ContactImportInput = {
  nome?: string;
  cpf?: string;
  telefone?: string;
  instituicao?: string;
};

export type ContactImportResult = {
  success: true;
  totalRecebidos: number;
  novosInseridos: number;
  vinculados: number;
};

function chunkArray<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, (i + 1) * size));
}

export async function importContactsForCampaign(
  campaignId: string,
  contacts: ContactImportInput[]
): Promise<ContactImportResult> {
  const contactsPayload = contacts.map((c) => {
    const cleanPhone = (c.telefone || '').replace(/\D/g, '');
    const normalizedPhone = cleanPhone.length === 12 || cleanPhone.length === 13 ? `+${cleanPhone}` : `+55${cleanPhone}`;
    return {
      nome: c.nome ?? null,
      cpf: (c.cpf || '').replace(/\D/g, ''),
      instituicao: c.instituicao ?? null,
      telefone: normalizedPhone
    };
  });

  const allPhones = contactsPayload.map((c) => c.telefone);
  const phoneChunks = chunkArray(allPhones, CHUNK_SIZE);
  const existingPhoneMap = new Map<string, string>();

  for (const chunk of phoneChunks) {
    const { data, error } = await supabaseAdmin.from('contacts').select('id, telefone').in('telefone', chunk);
    if (error) throw error;
    data?.forEach((c: any) => existingPhoneMap.set(c.telefone, c.id));
  }

  const newContacts = contactsPayload.filter((c) => !existingPhoneMap.has(c.telefone));
  const insertChunks = chunkArray(newContacts, CHUNK_SIZE);

  for (const chunk of insertChunks) {
    const { data, error } = await supabaseAdmin.from('contacts').insert(chunk).select('id, telefone');
    if (error) throw error;
    data?.forEach((c: any) => existingPhoneMap.set(c.telefone, c.id));
  }

  const processedIds = new Set<string>();
  const campaignPayload: Array<{ campaign_id: string; contact_id: string; status: string; tentativas: number }> = [];

  for (const c of contactsPayload) {
    const contactId = existingPhoneMap.get(c.telefone);
    if (contactId && !processedIds.has(contactId)) {
      campaignPayload.push({
        campaign_id: campaignId,
        contact_id: contactId,
        status: 'pendente',
        tentativas: 0
      });
      processedIds.add(contactId);
    }
  }

  const linkChunks = chunkArray(campaignPayload, CHUNK_SIZE);
  for (const chunk of linkChunks) {
    const { error: upsertErr } = await supabaseAdmin
      .from('campaign_contacts')
      .upsert(chunk, { onConflict: 'campaign_id,contact_id', ignoreDuplicates: true });

    if (upsertErr) {
      const { error: insertErr } = await supabaseAdmin.from('campaign_contacts').insert(chunk);
      if (insertErr && !insertErr.message.includes('duplicate')) throw insertErr;
    }
  }

  return {
    success: true,
    totalRecebidos: contacts.length,
    novosInseridos: newContacts.length,
    vinculados: campaignPayload.length
  };
}
