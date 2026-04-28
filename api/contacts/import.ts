import { createClient } from '@supabase/supabase-js';

const CHUNK_SIZE = 300;

function chunkArray<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, (i + 1) * size)
  );
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados no Vercel');
  return createClient(url, key, { auth: { persistSession: false } });
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Método não permitido' });

  try {
    const supabase = getSupabaseAdmin();
    const { campaignId, contacts } = req.body as {
      campaignId?: string;
      contacts?: Array<{ nome?: string; cpf?: string; telefone?: string; instituicao?: string }>;
    };

    if (!campaignId || !Array.isArray(contacts)) {
      return res.status(400).json({ success: false, error: 'Payload inválido' });
    }

    const contactsPayload = contacts.map((c) => {
      const cleanPhone = (c.telefone || '').replace(/\D/g, '');
      const normalizedPhone =
        cleanPhone.length === 12 || cleanPhone.length === 13
          ? `+${cleanPhone}`
          : `+55${cleanPhone}`;
      return {
        nome: c.nome ?? null,
        cpf: (c.cpf || '').replace(/\D/g, ''),
        instituicao: c.instituicao ?? null,
        telefone: normalizedPhone,
      };
    });

    const allPhones = contactsPayload.map((c) => c.telefone);
    const phoneChunks = chunkArray(allPhones, CHUNK_SIZE);
    const existingPhoneMap = new Map<string, string>();

    for (const chunk of phoneChunks) {
      const { data, error } = await supabase.from('contacts').select('id, telefone').in('telefone', chunk);
      if (error) throw error;
      data?.forEach((c: any) => existingPhoneMap.set(c.telefone, c.id));
    }

    const newContacts = contactsPayload.filter((c) => !existingPhoneMap.has(c.telefone));
    for (const chunk of chunkArray(newContacts, CHUNK_SIZE)) {
      const { data, error } = await supabase.from('contacts').insert(chunk).select('id, telefone');
      if (error) throw error;
      data?.forEach((c: any) => existingPhoneMap.set(c.telefone, c.id));
    }

    const processedIds = new Set<string>();
    const campaignPayload: Array<{ campaign_id: string; contact_id: string; status: string; tentativas: number }> = [];

    for (const c of contactsPayload) {
      const contactId = existingPhoneMap.get(c.telefone);
      if (contactId && !processedIds.has(contactId)) {
        campaignPayload.push({ campaign_id: campaignId, contact_id: contactId, status: 'pendente', tentativas: 0 });
        processedIds.add(contactId);
      }
    }

    for (const chunk of chunkArray(campaignPayload, CHUNK_SIZE)) {
      const { error: upsertErr } = await supabase
        .from('campaign_contacts')
        .upsert(chunk, { onConflict: 'campaign_id,contact_id', ignoreDuplicates: true });
      if (upsertErr) {
        const { error: insertErr } = await supabase.from('campaign_contacts').insert(chunk);
        if (insertErr && !insertErr.message.includes('duplicate')) throw insertErr;
      }
    }

    return res.status(200).json({
      success: true,
      totalRecebidos: contacts.length,
      novosInseridos: newContacts.length,
      vinculados: campaignPayload.length,
    });
  } catch (error: any) {
    console.error('[contacts/import] error', error);
    return res.status(500).json({ success: false, error: error.message || 'Erro interno' });
  }
}
