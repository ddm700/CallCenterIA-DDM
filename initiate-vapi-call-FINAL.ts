import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const body = await req.json();
        const { contactId, campaignId, customerNumber, customerName } = body;

        console.log('🚀 INITIATE-VAPI-CALL (Individual) Iniciada!');
        console.log('📥 Payload:', JSON.stringify(body));

        if (!customerNumber || !customerName) {
            throw new Error('Telefone e Nome são obrigatórios');
        }

        // 1a. Buscar dados extras do contato (CPF)
        let cpf = '';
        if (contactId) {
            const { data: contactData } = await supabase
                .from('contacts')
                .select('cpf')
                .eq('id', contactId)
                .single();

            cpf = contactData?.cpf || '';
            console.log('👤 CPF encontrado:', cpf);
        }

        // 1b. Buscar configuração do n8n (CORRIGIDO: Chave-Valor)
        const { data: setting } = await supabase
            .from('app_settings')
            .select('setting_value')
            .eq('setting_key', 'n8n_webhook_url')
            .limit(1)
            .maybeSingle();

        // Fallback para URL fixa
        const n8nWebhookUrl = setting?.setting_value || 'https://n8n-n8n-start.xzz0ed.easypanel.host/webhook/callcenteria';
        console.log('🔗 URL do n8n:', n8nWebhookUrl);

        // 2. Preparar payload para o n8n
        // Se tiver campaignId, busca dados da campanha. Se não, usa defaults.
        let assistantId = null;
        let phoneNumberId = null;

        if (campaignId) {
            const { data: campaign } = await supabase
                .from('campaigns')
                .select('assistant_vapi_id, linha_vapi_id')
                .eq('id', campaignId)
                .single();

            if (campaign) {
                assistantId = campaign.assistant_vapi_id;
                phoneNumberId = campaign.linha_vapi_id ? campaign.linha_vapi_id.split(',')[0] : null;
            }
        }

        const n8nPayload = {
            contactId: contactId,
            campaignId: campaignId || 'manual',
            customerNumber: customerNumber,
            customerName: customerName,
            cpf: cpf,
            assistantId: assistantId,
            phoneNumberId: phoneNumberId,
            callbackUrl: `${supabaseUrl}/functions/v1/vapi-call-callback`,
            tipoTelefonia: 'vapi' // Default para manual
        };

        console.log('📤 Enviando para n8n:', JSON.stringify(n8nPayload));

        // 3. Chamar n8n
        const response = await fetch(n8nWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(n8nPayload),
        });

        if (!response.ok) {
            throw new Error(`Erro n8n: ${response.status} ${response.statusText}`);
        }

        console.log('✅ Sucesso n8n!');

        // 4. Se tiver CampaignContact, atualizar status
        if (campaignId && contactId) {
            // Tenta achar o registro na tabela de ligação
            const { data: cc } = await supabase
                .from('campaign_contacts')
                .select('id, tentativas_realizadas')
                .eq('campaign_id', campaignId)
                .eq('contact_id', contactId)
                .maybeSingle();

            if (cc) {
                await supabase
                    .from('campaign_contacts')
                    .update({
                        status: 'em_andamento',
                        tentativas_realizadas: (cc.tentativas_realizadas || 0) + 1,
                        ultima_tentativa: new Date().toISOString()
                    })
                    .eq('id', cc.id);
            }
        }

        return new Response(JSON.stringify({ success: true, message: 'Ligação iniciada' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error: any) {
        console.error('❌ Erro:', error);
        return new Response(JSON.stringify({ success: false, error: error.message }), {
            status: 200, // Retornar 200 com erro no body para nao quebrar frontend
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
