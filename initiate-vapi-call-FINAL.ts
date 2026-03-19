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

        console.log('🚀 INITIATE-VAPI-CALL Iniciada!');
        console.log('📥 Payload recebido:', JSON.stringify(body));

        if (!customerNumber || !customerName) {
            throw new Error('Telefone e Nome são obrigatórios');
        }

        // 🔎 Buscar CPF do contato
        let cpf = '';
        if (contactId) {
            const { data: contactData } = await supabase
                .from('contacts')
                .select('cpf')
                .eq('id', contactId)
                .maybeSingle();

            cpf = contactData?.cpf || '';
            console.log('👤 CPF encontrado:', cpf);
        }

        // 🔎 Buscar URL do n8n
        const { data: setting } = await supabase
            .from('app_settings')
            .select('setting_value')
            .eq('setting_key', 'n8n_webhook_url')
            .limit(1)
            .maybeSingle();

        const n8nWebhookUrl =
            setting?.setting_value ||
            'https://n8n-n8n-start.xzz0ed.easypanel.host/webhook/callcenteria';

        console.log('🔗 URL do n8n:', n8nWebhookUrl);

        // 🔎 Buscar dados da campanha (assistant + linha)
        let assistantId: string | null = null;
        let phoneNumberId: string | null = null;

        if (campaignId) {
            const { data: campaign } = await supabase
                .from('campaigns')
                .select('assistant_vapi_id, linha_vapi_id')
                .eq('id', campaignId)
                .maybeSingle();

            if (campaign) {
                assistantId = campaign.assistant_vapi_id;
                phoneNumberId = campaign.linha_vapi_id
                    ? campaign.linha_vapi_id.split(',')[0]
                    : null;
            }
        }

        // 🔎 Buscar campaignContactId corretamente
        let campaignContactId: string | null = null;

        if (campaignId && contactId) {
            const { data: cc } = await supabase
                .from('campaign_contacts')
                .select('id')
                .eq('campaign_id', campaignId)
                .eq('contact_id', contactId)
                .in('status', ['pendente', 'em_andamento'])
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            campaignContactId = cc?.id || null;

            if (cc) {
                await supabase
                    .from('campaign_contacts')
                    .update({
                        status: 'em_andamento',
                        ultima_tentativa: new Date().toISOString()
                    })
                    .eq('id', cc.id);
            }
        }

        // 📤 Payload padronizado para n8n
        const n8nPayload = {
            contactId: contactId,
            campaignContactId: campaignContactId,
            campaignId: campaignId || 'manual',
            customerNumber: customerNumber,
            customerName: customerName,
            cpf: cpf,
            assistantId: assistantId,
            phoneNumberId: phoneNumberId,
            callbackUrl: `${supabaseUrl}/functions/v1/vapi-call-callback`,
            tipoTelefonia: 'vapi'
        };

        console.log('📤 Enviando para n8n:', JSON.stringify(n8nPayload));

        // 🔁 Disparar n8n
        const response = await fetch(n8nWebhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-source': 'supabase-edge',
                'x-function-name': 'initiate-vapi-call',
                'x-system': 'discador-vapi',
                'x-version': '1.0'
            },
            body: JSON.stringify(n8nPayload),
        });

        if (!response.ok) {
            throw new Error(`Erro n8n: ${response.status} ${response.statusText}`);
        }

        console.log('✅ Webhook n8n enviado com sucesso');

        return new Response(
            JSON.stringify({ success: true, message: 'Ligação iniciada' }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        );

    } catch (error: any) {
        console.error('❌ Erro:', error);

        return new Response(
            JSON.stringify({
                success: false,
                error: error.message || 'Erro interno'
            }),
            {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        );
    }
});