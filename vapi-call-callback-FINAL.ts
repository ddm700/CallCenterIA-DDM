/**
 * Edge Function: vapi-call-callback
 * 
 * Função serverless que recebe callbacks do VAPI ao fim de cada ligação.
 * Processa o relatório de fim de chamada e atualiza os registros no banco.
 * 
 * Funcionalidades:
 * - Recebe e valida payload do VAPI (end-of-call-report)
 * - Localiza ou cria registro da chamada no banco
 * - Extrai e salva todos os dados da chamada (duração, custos, transcrição, etc.)
 * - Atualiza status do contato na campanha baseado no resultado
 * - Gerencia registros "órfãos" criados antes do callback
 * 
 * @module supabase/functions/vapi-call-callback
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0'

/** Headers CORS para permitir chamadas externas */
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Interface do relatório de fim de chamada do VAPI
 * Contém todos os dados da chamada finalizada
 * 
 * @interface VapiEndOfCallReport
 */
interface VapiEndOfCallReport {
    /** Tipo do evento (sempre 'end-of-call-report' para este callback) */
    type: 'end-of-call-report';
    /** Dados da chamada */
    call: {
        /** ID único da chamada no VAPI */
        id: string;
        /** Timestamp de início da chamada */
        startedAt: string;
        /** Timestamp de término da chamada */
        endedAt: string;
        /** Motivo do término (ex: 'customer-ended-call', 'assistant-ended-call', 'no-answer') */
        endedReason: string;
        /** Custos detalhados da chamada */
        costs?: Array<{
            type: string;
            amount: number;
            tokens?: number;
            seconds?: number;
        }>;
        /** Análise da chamada (resumo, sucesso, dados estruturados) */
        analysis?: {
            summary?: string;
            successEvaluation?: string | boolean;
            structuredData?: Record<string, any>;
        };
        /** Artefatos da chamada (transcrição, gravações, logs) */
        artifact?: {
            transcript?: string;
            recording?: {
                url?: string;
                stereoRecordingUrl?: string;
            };
            messages?: Array<{
                role: string;
                message: string;
                time: number;
            }>;
            videoRecordingUrl?: string;
            artifactLogUrl?: string;
        };
        /** ID do assistente VAPI usado */
        assistantId?: string;
        /** ID do número de telefone VAPI usado */
        phoneNumberId?: string;
    };
    /** Metadados customizados enviados ao iniciar a ligação */
    metadata?: {
        contactId?: string;
        campaignContactId?: string;
        phoneId?: string;
        campaignId?: string;
    };
}

/**
 * Handler principal da Edge Function
 */
Deno.serve(async (req) => {
    // Responde a requisições OPTIONS (preflight CORS)
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        console.log('=== VAPI CALLBACK RECEBIDO ===');
        console.log('Timestamp:', new Date().toISOString());
        console.log('Method:', req.method);
        console.log('Headers:', Object.fromEntries(req.headers.entries()));

        // Inicializa cliente Supabase
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // Parsear payload da requisição
        let payload: any = await req.json();
        console.log('Payload RAW:', JSON.stringify(payload, null, 2));

        // 1. Normalização do Payload
        // VAPI pode mandar envelopado em "message" (padrão Server URL)
        if (payload.message) {
            console.log('📦 Payload envelopado em "message", extraindo...');
            payload = payload.message;
        }

        // 2. Extração do objeto CALL e METADATA
        // Às vezes o payload JÁ É o objeto call (se vier do n8n flatten)
        // Às vezes tem uma propriedade .call
        let call = payload.call || payload;
        let metadata = payload.metadata || payload.call?.metadata || {};

        // Se o objeto 'call' não tiver ID, tentamos achar no payload raiz
        if (!call.id && payload.id) {
            call = payload;
        }

        console.log('--- DADOS EXTRAÍDOS ---');
        console.log('Call ID:', call.id);
        console.log('Status:', call.status);
        console.log('Started At:', call.startedAt);
        console.log('Ended At:', call.endedAt);
        console.log('Analysis Summary:', call.analysis?.summary);
        console.log('Metadata Contact ID:', metadata.contactId);
        console.log('-----------------------');

        // Se ainda não tivermos ID, algo está muito errado com o payload
        if (!call.id) {
            console.error('❌ Não foi possível identificar o objeto CALL no payload.');
            return new Response(
                JSON.stringify({ success: false, error: 'Invalid payload structure: missing call.id' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Validar tipo do evento (opcional, pois já garantimos que temos dados)
        // if (payload.type !== 'end-of-call-report' && call.status !== 'ended') ...

        // 1. Buscar chamada existente pelo vapi_call_id (prioridade)
        let existingCall: { id: string; campaign_contact_id: string | null } | null = null;

        const { data: foundCall, error: findError } = await supabase
            .from('calls')
            .select('id, campaign_contact_id')
            .eq('vapi_call_id', call.id)
            .maybeSingle();

        if (findError) {
            console.error('Erro ao buscar chamada:', findError);
            throw new Error(`Erro ao buscar chamada: ${findError.message}`);
        }

        // 2. Se não encontrou por vapi_call_id, buscar registro "órfão" pelo campaign_contact_id
        if (!foundCall && metadata?.campaignContactId) {
            console.log(`Não encontrado por vapi_call_id, buscando registro órfão por campaign_contact_id: ${metadata.campaignContactId}`);

            // Buscar registro criado pelo initiate-vapi-call (sem vapi_call_id ainda)
            const { data: orphanCall, error: orphanError } = await supabase
                .from('calls')
                .select('id, campaign_contact_id')
                .eq('campaign_contact_id', metadata.campaignContactId)
                .is('vapi_call_id', null) // Sem vapi_call_id = órfão
                .eq('status', 'queued')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (orphanCall) {
                console.log(`✅ Registro órfão encontrado: ${orphanCall.id}. Será atualizado em vez de criar novo.`);
                existingCall = orphanCall;

                // Atualizar o vapi_call_id do registro órfão
                const { error: updateIdError } = await supabase
                    .from('calls')
                    .update({ vapi_call_id: call.id })
                    .eq('id', orphanCall.id);

                if (updateIdError) {
                    console.error('Erro ao atualizar vapi_call_id do órfão:', updateIdError);
                } else {
                    console.log(`✅ vapi_call_id atualizado para: ${call.id}`);

                    // Cleanup: deletar outros registros órfãos antigos do mesmo contato
                    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
                    const { error: cleanupError } = await supabase
                        .from('calls')
                        .delete()
                        .eq('campaign_contact_id', metadata.campaignContactId)
                        .is('vapi_call_id', null)
                        .neq('id', orphanCall.id)
                        .lt('created_at', tenMinutesAgo);

                    if (cleanupError) {
                        console.warn('⚠️ Erro ao limpar registros órfãos antigos:', cleanupError);
                    } else {
                        console.log('🧹 Limpeza de órfãos antigos concluída');
                    }
                }
            }
        }

        // 3. Se ainda não encontrou, criar novo registro
        if (!existingCall && !foundCall) {
            console.warn(`⚠️ Nenhum registro encontrado. Criando novo para vapi_call_id: ${call.id}`);

            const { data: newCall, error: insertError } = await supabase
                .from('calls')
                .insert({
                    vapi_call_id: call.id,
                    campaign_contact_id: metadata?.campaignContactId || null,
                    contact_phone_id: metadata?.phoneId || null,
                    status: 'completed',
                })
                .select('id, campaign_contact_id')
                .maybeSingle();

            if (insertError) {
                // Pode ser duplicata por race condition, tentar buscar novamente
                console.log('Erro ao inserir (possível race condition), tentando buscar novamente...');
                const { data: retryCall } = await supabase
                    .from('calls')
                    .select('id, campaign_contact_id')
                    .eq('vapi_call_id', call.id)
                    .maybeSingle();

                if (retryCall) {
                    existingCall = retryCall;
                    console.log(`Chamada encontrada no retry: ${existingCall.id}`);
                } else {
                    throw new Error(`Erro ao criar chamada e retry falhou: ${insertError.message}`);
                }
            } else {
                existingCall = newCall;
                console.log(`✅ Nova chamada criada: ${existingCall?.id}`);
            }
        } else if (!existingCall) {
            existingCall = foundCall;
            console.log(`✅ Usando chamada existente: ${existingCall?.id}`);
        }

        if (!existingCall) {
            throw new Error('Falha ao obter registro de chamada após todas as tentativas');
        }

        // 4. Calcular duração em segundos
        const startedAt = new Date(call.startedAt);
        const endedAt = new Date(call.endedAt);
        const durationSeconds = Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000);

        // 5. Extrair custos detalhados
        const costs = call.costs || [];
        const custo_stt = costs.find(c => c.type === 'stt' || c.type === 'transcription')?.amount || 0;
        const custo_tts = costs.find(c => c.type === 'tts' || c.type === 'voice')?.amount || 0;
        const custo_vapi = costs.find(c => c.type === 'vapi' || c.type === 'service')?.amount || 0;
        const custo_total = costs.reduce((sum, cost) => sum + cost.amount, 0);

        // 6. Extrair dados estruturados da análise
        const structuredData = call.analysis?.structuredData || {};
        const structured_name = structuredData.name || null;
        const structured_rating_label = structuredData.rating?.label || null;
        const structured_rating_text = structuredData.rating?.text || null;
        const structured_purpose = structuredData.purpose || null;
        const structured_main_points = structuredData.mainPoints || null;
        const structured_next_steps = structuredData.nextSteps || null;
        const structured_emotions_objections = structuredData.emotionsObjections || null;

        // 7. Converter success_evaluation para texto
        let successEvaluation = null;
        if (call.analysis?.successEvaluation !== undefined) {
            if (typeof call.analysis.successEvaluation === 'boolean') {
                successEvaluation = call.analysis.successEvaluation ? 'true' : 'false';
            } else {
                successEvaluation = String(call.analysis.successEvaluation);
            }
        }

        // 8. Preparar dados para atualização
        const updateData = {
            started_at: call.startedAt,
            ended_at: call.endedAt,
            ended_reason: call.endedReason,
            duration_seconds: durationSeconds,
            custo_total: custo_total,
            custo_stt: custo_stt,
            custo_tts: custo_tts,
            custo_vapi: custo_vapi,
            summary: call.analysis?.summary || null,
            success_evaluation: successEvaluation,
            transcript: call.artifact?.transcript || null,
            recording_url: call.artifact?.recording?.url || null,
            stereo_recording_url: call.artifact?.recording?.stereoRecordingUrl || null,
            artifact_log_url: call.artifact?.artifactLogUrl || null,
            assistant_id: call.assistantId || null,
            phone_number_id: call.phoneNumberId || null,
            structured_name: structured_name,
            structured_rating_label: structured_rating_label,
            structured_rating_text: structured_rating_text,
            structured_purpose: structured_purpose,
            structured_main_points: structured_main_points,
            structured_next_steps: structured_next_steps,
            structured_emotions_objections: structured_emotions_objections,
            metadata_raw: payload, // Salvar payload completo para debug
            status: call.endedReason === 'assistant-ended-call' || call.endedReason === 'customer-ended-call'
                ? 'completed'
                : call.endedReason,
        };

        console.log('Atualizando chamada:', existingCall.id, updateData);

        // 9. Atualizar registro da chamada no banco
        const { error: updateError } = await supabase
            .from('calls')
            .update(updateData)
            .eq('id', existingCall.id);

        if (updateError) {
            console.error('Erro ao atualizar chamada:', updateError);
            throw new Error(`Erro ao atualizar chamada: ${updateError.message}`);
        }

        // 10. Atualizar status do campaign_contacts
        const campaignContactId = existingCall.campaign_contact_id || metadata?.campaignContactId;

        if (campaignContactId) {
            // Buscar campaign_contact para verificar tentativas
            const { data: campaignContact, error: ccError } = await supabase
                .from('campaign_contacts')
                .select('tentativas_realizadas, campaign_id(max_tentativas)')
                .eq('id', campaignContactId)
                .single();

            if (ccError) {
                console.error('Erro ao buscar campaign_contact:', ccError);
            } else {
                console.log('=== ATUALIZANDO STATUS DO CAMPAIGN_CONTACT ===');
                console.log('Campaign Contact ID:', campaignContactId);
                console.log('Tentativas Realizadas:', campaignContact.tentativas_realizadas);
                const maxTentativas = (campaignContact.campaign_id as any)?.max_tentativas || 3;
                console.log('Max Tentativas:', maxTentativas);
                console.log('Success Evaluation:', successEvaluation, typeof successEvaluation);
                console.log('Ended Reason:', call.endedReason);

                let newStatus = 'pendente';

                // Falhas técnicas que não indicam conversa real
                const technicalFailures = [
                    // Erros na inicialização da chamada
                    'call.start.error-get-resources-validation',
                    'call.start.error-get-transport',

                    // Erros durante a chamada (infra / SIP / provider)
                    'call.in-progress.error-sip-outbound-call-failed-to-connect',
                    'call.in-progress.error-providerfault-outbound-sip-503-service-unavailable',
                    'call.in-progress.error-providerfault-outbound-sip-480-temporarily-unavailable',

                    // Outros erros técnicos genéricos já previstos
                    'pipeline-error-openai-voice-failed',
                    'assistant-not-found',
                    'invalid-number'
                ];
                // Cliente não atendeu (tentativa válida, sem conversa)
                const noAnswerFailures = [
                    'customer-did-not-answer',
                    'customer-busy',
                    'voicemail',
                    'silence-timed-out'
                ];
                // Términos que indicam que houve conversa real
                const successfulEndings = [
                    'customer-ended-call',
                    'assistant-ended-call',
                    'customer-busy',
                    'voicemail',
                    'silence-timed-out'
                ];

                // Duração mínima para considerar conversa válida (segundos)
                const MIN_DURATION_FOR_SUCCESS = 15;

                // Determinar novo status baseado no resultado da ligação
                if (successEvaluation === 'true') {
                    // Prioridade 1: sucesso explícito da VAPI
                    newStatus = 'concluido';
                    console.log('✅ Ligação concluída - successEvaluation = true');

                } else if (
                    successfulEndings.includes(call.endedReason) &&
                    durationSeconds >= MIN_DURATION_FOR_SUCCESS
                ) {
                    // Prioridade 2: conversa real ocorreu
                    newStatus = 'concluido';
                    console.log(`✅ Ligação concluída - ${call.endedReason} com duração ${durationSeconds}s`);

                } else if (noAnswerFailures.includes(call.endedReason)) {
                    // Cliente não atendeu (tentativa válida)
                    if (campaignContact.tentativas_realizadas >= maxTentativas) {
                        newStatus = 'falhou';
                        console.log('❌ Cliente não atendeu e limite de tentativas atingido');
                    } else {
                        newStatus = 'em_andamento';
                        console.log('🔁 Cliente não atendeu, nova tentativa será agendada');
                    }
                } else if (technicalFailures.includes(call.endedReason)) {
                    // Falha técnica (tentativa NÃO válida)
                    if (campaignContact.tentativas_realizadas >= maxTentativas) {
                        newStatus = 'falhou';
                        console.log('❌ Falha técnica e limite de tentativas atingido');
                    } else {
                        newStatus = 'em_andamento';
                        console.log(`⚠️ Falha técnica (${call.endedReason}), nova tentativa será agendada`);
                    }

                } else {
                    // Qualquer motivo não mapeado → tratar como tentativa inválida segura
                    if (campaignContact.tentativas_realizadas >= maxTentativas) {
                        newStatus = 'falhou';
                        console.log('❌ Motivo não mapeado e limite de tentativas atingido');
                    } else {
                        newStatus = 'em_andamento';
                        console.log(`⚠️ Motivo não mapeado (${call.endedReason}), nova tentativa será agendada`);
                    }
                }

            }
        }

        console.log('Callback processado com sucesso');

        // Retornar sucesso
        return new Response(
            JSON.stringify({
                success: true,
                callId: existingCall.id,
                message: 'Callback processado com sucesso'
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        // Handler de erro geral
        console.error('Erro ao processar callback:', error);

        return new Response(
            JSON.stringify({
                success: false,
                error: error.message || 'Erro interno do servidor'
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
