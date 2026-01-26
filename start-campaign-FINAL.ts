/**
 * Edge Function: start-campaign (FINAL - COM DEBUG)
 * Atualizado em: 24/01/2026 14:03
 * 
 * Função serverless para iniciar campanhas de ligações em massa.
 * Processa todos os contatos elegíveis de uma campanha, distribuindo
 * as ligações entre as linhas VAPI disponíveis de forma balanceada.
 * 
 * CORREÇÕES APLICADAS:
 * - Busca telefones corretamente da tabela contact_phones
 * - Usa Service Role Key para autenticação entre Edge Functions
 * - Logs detalhados para debug de erros
 * - Validação melhorada para garantir que todos os contatos tenham telefone
 * 
 * @module supabase/functions/start-campaign
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';
import { format, toZonedTime } from 'https://esm.sh/date-fns-tz@3.2.0';

/** Headers CORS para permitir chamadas do frontend */
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Interface do payload de requisição
 */
interface StartCampaignRequest {
    campaignId: string;
}

/**
 * Interface do resultado de processamento de um contato
 */
interface ProcessResult {
    contactId: string;
    contactName: string;
    success: boolean;
    error?: string;
}

/** Delay entre lotes de ligações (2 segundos) */
const DELAY_BETWEEN_BATCHES_MS = 2000;

/**
 * Handler principal da Edge Function
 */
Deno.serve(async (req) => {
    // Responde a requisições OPTIONS (preflight CORS)
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        // Inicializa cliente Supabase com credenciais de serviço
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        console.log('🔑 Supabase URL:', supabaseUrl);
        console.log('🔑 Service Key presente:', !!supabaseServiceKey);
        console.log('🔑 Anon Key presente:', !!supabaseAnonKey);

        // Extrai o ID da campanha do corpo da requisição
        const { campaignId }: StartCampaignRequest = await req.json();

        console.log('=== INICIANDO CAMPANHA ===');
        console.log('Campaign ID:', campaignId);

        // 1. Buscar dados da campanha no banco
        const { data: campaign, error: campaignError } = await supabase
            .from('campaigns')
            .select('*')
            .eq('id', campaignId)
            .single();

        if (campaignError || !campaign) {
            throw new Error('Campanha não encontrada');
        }

        if (!campaign.ativa) {
            throw new Error('Campanha não está ativa');
        }

        // 2. Verificar horário de funcionamento
        if (!campaign.ignore_horario) {
            const brasiliaTime = toZonedTime(new Date(), 'America/Sao_Paulo');
            const currentHour = format(brasiliaTime, 'HH:mm', { timeZone: 'America/Sao_Paulo' });

            if (currentHour < campaign.janela_inicio || currentHour > campaign.janela_fim) {
                throw new Error(`Fora do horário de funcionamento (${campaign.janela_inicio} - ${campaign.janela_fim})`);
            }
        }

        /**
         * Embaralha um array usando o algoritmo Fisher-Yates
         */
        const shuffleArray = <T>(array: T[]): T[] => {
            const shuffled = [...array];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            return shuffled;
        };

        // 3. Configurar linhas VAPI
        let vapiLines: string[] = [];
        if (campaign.tipo_telefonia === 'vapi') {
            if (!campaign.assistant_vapi_id || !campaign.linha_vapi_id) {
                throw new Error('Campanha sem configuração VAPI completa');
            }

            const parsedLines = campaign.linha_vapi_id.split(',').filter(Boolean);
            vapiLines = shuffleArray(parsedLines);

            if (vapiLines.length === 0) {
                throw new Error('Nenhuma linha VAPI configurada');
            }
            console.log(`Linhas VAPI configuradas: ${vapiLines.length}`, vapiLines);
        }

        // 4. Buscar contatos da campanha
        const { data: campaignContacts, error: contactsError } = await supabase
            .from('campaign_contacts')
            .select(`
                id,
                tentativas_realizadas,
                ultima_tentativa,
                status,
                contact_id,
                contacts (
                    id,
                    nome,
                    cpf,
                    instituicao,
                    telefone
                )
            `)
            .eq('campaign_id', campaignId)
            .in('status', ['pendente', 'em_andamento']);

        if (contactsError) {
            console.error('❌ Erro ao buscar contatos:', contactsError);
            throw new Error('Erro ao buscar contatos: ' + contactsError.message);
        }

        console.log(`📊 Total de contatos encontrados: ${campaignContacts?.length || 0}`);

        if (!campaignContacts || campaignContacts.length === 0) {
            return new Response(
                JSON.stringify({
                    success: true,
                    message: 'Nenhum contato pendente para processar',
                    totalProcessed: 0,
                    successful: 0,
                    failed: 0
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 5. Filtrar contatos elegíveis
        const now = new Date();
        const eligibleContacts = campaignContacts.filter((cc: any) => {
            if (cc.tentativas_realizadas >= campaign.max_tentativas) {
                return false;
            }

            if (cc.ultima_tentativa) {
                const lastAttempt = new Date(cc.ultima_tentativa);
                const minutesSinceLastAttempt = (now.getTime() - lastAttempt.getTime()) / (1000 * 60);
                if (minutesSinceLastAttempt < campaign.intervalo_minutos) {
                    return false;
                }
            }

            return true;
        });

        console.log(`✅ Contatos elegíveis: ${eligibleContacts.length} de ${campaignContacts.length}`);

        if (eligibleContacts.length === 0) {
            return new Response(
                JSON.stringify({
                    success: true,
                    message: 'Nenhum contato elegível no momento',
                    totalProcessed: 0,
                    successful: 0,
                    failed: 0
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 6. Buscar telefones da tabela contact_phones
        const contactIds = eligibleContacts.map((cc: any) => cc.contact_id);

        console.log(`📞 Buscando telefones para ${contactIds.length} contatos...`);

        const { data: phones, error: phonesError } = await supabase
            .from('contact_phones')
            .select('*')
            .in('contact_id', contactIds)
            .order('prioridade', { ascending: true });

        if (phonesError) {
            console.error('❌ Erro ao buscar telefones:', phonesError);
        }

        console.log(`📞 Telefones encontrados: ${phones?.length || 0}`);

        // Criar mapa de telefones por contact_id
        const phonesByContactId = new Map();
        if (phones) {
            phones.forEach((phone: any) => {
                if (!phonesByContactId.has(phone.contact_id)) {
                    phonesByContactId.set(phone.contact_id, phone);
                }
            });
        }

        /**
         * Processa um contato individual
         */
        const processContact = async (cc: any, lineIndex: number): Promise<ProcessResult> => {
            const contact = Array.isArray(cc.contacts) ? cc.contacts[0] : cc.contacts;

            // Buscar telefone
            let phoneData = phonesByContactId.get(contact?.id);
            let phoneNumber = phoneData?.numero;

            // Fallback para telefone direto em contacts
            if (!phoneNumber && contact?.telefone) {
                console.log(`⚠️ Usando telefone direto do contato ${contact.nome}: ${contact.telefone}`);
                phoneNumber = contact.telefone;
                phoneData = {
                    id: `fallback-${contact.id}`,
                    contact_id: contact.id,
                    numero: contact.telefone,
                    tipo: 'celular',
                    prioridade: 1
                };
            }

            // Validar dados
            if (!phoneNumber || !contact) {
                console.error(`❌ Contato sem telefone: ${contact?.nome || 'Desconhecido'}`);
                return {
                    contactId: contact?.id || cc.contact_id,
                    contactName: contact?.nome || 'Desconhecido',
                    success: false,
                    error: 'Sem telefone cadastrado ou contato não encontrado'
                };
            }

            try {
                console.log(`📞 Iniciando processamento para ${contact.nome} (${phoneNumber})`);

                // ✅ SOLUÇÃO DEFINITIVA: Processamento Direto (Sem invocar outra Function)
                // 1. Atualizar status no banco
                // 2. Disparar n8n diretamente

                // Buscar config do n8n (cachear isso seria ideal, mas vamos buscar rapidinho)
                // Nota: Idealmente buscaríamos isso fora do loop, mas para manter a estrutura segura aqui:
                // Buscar URL do n8n na tabela de configurações (Chave-Valor)
                const { data: setting } = await supabase
                    .from('app_settings')
                    .select('setting_value')
                    .eq('setting_key', 'n8n_webhook_url')
                    .limit(1)
                    .maybeSingle();

                // ✅ FALLBACK: Se não tiver no banco, usa a URL conhecida
                const n8nWebhookUrl = setting?.setting_value || 'https://n8n-n8n-start.xzz0ed.easypanel.host/webhook/callcenteria';

                if (!n8nWebhookUrl) {
                    throw new Error('URL do webhook n8n não configurada em app_settings');
                }

                const linhaVapiId = campaign.tipo_telefonia === 'vapi'
                    ? vapiLines[lineIndex % vapiLines.length]
                    : null;

                // Payload para o n8n
                const n8nPayload = {
                    contactId: contact.id,
                    campaignContactId: cc.id,
                    phoneId: phoneData.id,
                    campaignId: campaign.id,
                    customerNumber: phoneNumber,
                    customerName: contact.nome,
                    customerCpf: contact.cpf,
                    assistantId: campaign.assistant_vapi_id,
                    phoneNumberId: linhaVapiId || campaign.linha_vapi_id?.split(',')[0],
                    callbackUrl: `${supabaseUrl}/functions/v1/vapi-call-callback`,
                    tipoTelefonia: campaign.tipo_telefonia // Passar tipo para n8n decidir fluxo
                };

                console.log('� Disparando webhook n8n:', n8nWebhookUrl);

                // Disparar n8n
                const response = await fetch(n8nWebhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(n8nPayload),
                });

                if (!response.ok) {
                    throw new Error(`Erro n8n: ${response.status} ${response.statusText}`);
                }

                console.log('✅ Webhook n8n enviado com sucesso!');

                // Atualizar status do contato
                const { error: updateError } = await supabase
                    .from('campaign_contacts')
                    .update({
                        status: 'em_andamento',
                        tentativas_realizadas: (cc.tentativas_realizadas || 0) + 1,
                        ultima_tentativa: new Date().toISOString(),
                    })
                    .eq('id', cc.id);

                if (updateError) {
                    console.error('⚠️ Erro ao atualizar campaign_contacts:', updateError);
                }

                return {
                    contactId: contact.id,
                    contactName: contact.nome,
                    success: true
                };
            } catch (error: any) {
                console.error(`✗ Erro ao processar ${contact.nome}:`, error.message);
                console.error('  Stack:', error.stack);
                return {
                    contactId: contact.id,
                    contactName: contact.nome,
                    success: false,
                    error: error.message
                };
            }
        };

        // 7. Processar contatos em lotes
        const batchSize = campaign.tipo_telefonia === 'vapi' ? vapiLines.length : (campaign.ligacoes_simultaneas || 1);
        const allResults: ProcessResult[] = [];

        console.log(`🚀 Processando ${eligibleContacts.length} contatos em lotes de ${batchSize}`);

        for (let i = 0; i < eligibleContacts.length; i += batchSize) {
            const batch = eligibleContacts.slice(i, i + batchSize);
            const batchNumber = Math.floor(i / batchSize) + 1;
            const totalBatches = Math.ceil(eligibleContacts.length / batchSize);

            console.log(`\n--- Lote ${batchNumber}/${totalBatches} (${batch.length} contatos) ---`);

            const batchResults = [];
            for (let j = 0; j < batch.length; j++) {
                const result = await processContact(batch[j], i + j);
                batchResults.push(result);

                if (j < batch.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }

            allResults.push(...batchResults);

            if (i + batchSize < eligibleContacts.length) {
                console.log(`⏳ Aguardando ${DELAY_BETWEEN_BATCHES_MS}ms antes do próximo lote...`);
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
            }
        }

        // 8. Calcular estatísticas finais
        const successful = allResults.filter(r => r.success).length;
        const failed = allResults.filter(r => !r.success).length;

        console.log(`\n=== CAMPANHA PROCESSADA ===`);
        console.log(`Total: ${allResults.length}, Sucesso: ${successful}, Falhas: ${failed}`);

        return new Response(
            JSON.stringify({
                success: true,
                message: `Processamento concluído: ${successful} ligações iniciadas, ${failed} falhas`,
                totalProcessed: allResults.length,
                successful,
                failed,
                results: allResults
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('❌ Erro ao iniciar campanha:', error);
        console.error('  Stack:', error.stack);
        return new Response(
            JSON.stringify({
                success: false,
                error: error.message || 'Erro desconhecido ao iniciar campanha'
            }),
            {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        );
    }
});
