import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {

  // ✅ Tratamento CORS (preflight)
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { campaignId, contacts } = await req.json()

    if (!campaignId || !contacts || !Array.isArray(contacts)) {
      return new Response(
        JSON.stringify({ error: "Payload inválido" }),
        { 
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      )
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const CHUNK = 300

    const chunkArray = <T>(arr: T[], size: number): T[][] =>
      Array.from(
        { length: Math.ceil(arr.length / size) },
        (_, i) => arr.slice(i * size, (i + 1) * size)
      )

    let contactsPayload: any[] = []
    let existingPhoneMap = new Map<string, string>()
    let newContacts: any[] = []
    let campaignPayload: any[] = []

    // 🔹 FASE 1 – Normalização
    console.log("[FASE 1] Normalizando dados")

    contactsPayload = contacts.map((c: any) => {
      const cleanPhone = (c.telefone || "").replace(/\D/g, "")
      const normalizedPhone =
        cleanPhone.length === 12 || cleanPhone.length === 13
          ? `+${cleanPhone}`
          : `+55${cleanPhone}`

      return {
        nome: c.nome ?? null,
        cpf: (c.cpf || "").replace(/\D/g, ""),
        instituicao: c.instituicao ?? null,
        telefone: normalizedPhone
      }
    })

    // 🔹 FASE 2 – Buscar telefones existentes
    console.log("[FASE 2] Verificando duplicatas")

    const allPhones = contactsPayload.map(c => c.telefone)
    const phoneChunks = chunkArray(allPhones, CHUNK)

    for (let i = 0; i < phoneChunks.length; i++) {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, telefone")
        .in("telefone", phoneChunks[i])

      if (error) throw error

      data?.forEach((c: any) => {
        existingPhoneMap.set(c.telefone, c.id)
      })
    }

    // 🔹 FASE 3 – Inserir novos contatos
    console.log("[FASE 3] Inserindo novos contatos")

    newContacts = contactsPayload.filter(
      c => !existingPhoneMap.has(c.telefone)
    )

    const insertChunks = chunkArray(newContacts, CHUNK)

    for (let i = 0; i < insertChunks.length; i++) {
      const { data, error } = await supabase
        .from("contacts")
        .insert(insertChunks[i])
        .select("id, telefone")

      if (error) throw error

      data?.forEach((c: any) => {
        existingPhoneMap.set(c.telefone, c.id)
      })
    }

    // 🔹 FASE 4 – Construir vínculos
    console.log("[FASE 4] Construindo vínculos")

    const processedIds = new Set<string>()

    for (const c of contactsPayload) {
      const contactId = existingPhoneMap.get(c.telefone)

      if (contactId && !processedIds.has(contactId)) {
        campaignPayload.push({
          campaign_id: campaignId,
          contact_id: contactId,
          status: "pendente",
          tentativas: 0
        })

        processedIds.add(contactId)
      }
    }

    // 🔹 FASE 5 – Upsert campaign_contacts
    console.log("[FASE 5] Persistindo vínculos")

    const linkChunks = chunkArray(campaignPayload, CHUNK)

    for (let i = 0; i < linkChunks.length; i++) {
      const { error: upsertErr } = await supabase
        .from("campaign_contacts")
        .upsert(linkChunks[i], {
          onConflict: "campaign_id,contact_id",
          ignoreDuplicates: true
        })

      if (upsertErr) {
        const { error: insertErr } = await supabase
          .from("campaign_contacts")
          .insert(linkChunks[i])

        if (insertErr && !insertErr.message.includes("duplicate"))
          throw insertErr
      }
    }

    console.log("[SUCESSO] Importação concluída")

    return new Response(
      JSON.stringify({
        success: true,
        totalRecebidos: contacts.length,
        novosInseridos: newContacts.length,
        vinculados: campaignPayload.length
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )

  } catch (err: any) {
    console.error("[ERRO GERAL]", err)

    return new Response(
      JSON.stringify({
        success: false,
        error: err.message
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    )
  }
})