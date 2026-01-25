// Simulação do Callback da VAPI
// Execute no console do navegador

const callbackUrl = 'https://mkrkkvbseobdqsalrorl.supabase.co/functions/v1/vapi-call-callback';

const fakeVapiPayload = {
    message: {
        type: "end-of-call-report",
        call: {
            id: "fake-call-" + Date.now(),
            status: "completed",
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
            cost: 0.5,
            customer: {
                number: "+5511999999999",
                name: "Teste Manual"
            },
            transcript: "Olá, isso é um teste.",
            summary: "Teste de callback manual confirmando recebimento.",
            recordingUrl: "https://vapi.ai/fake-recording.mp3",
            analysis: {
                successEvaluation: "true"
            }
        },
        // A VAPI costuma mandar assistantOverrides onde colocamos metadados
        assistantOverrides: {
            variableValues: {
                // Aqui esperamos que nossos IDs estejam. Se o n8n não repassou, 
                // nosso callback pode falhar ao tentar achar a campaignContactId
                // Vamos testar sem IDs primeiro para ver se a rota existe
            }
        }
    }
};

console.log('📨 Enviando callback de teste para:', callbackUrl);

fetch(callbackUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fakeVapiPayload)
})
    .then(async res => {
        console.log('Status:', res.status);
        console.log('Body:', await res.text());
        if (res.ok) console.log('✅ Callback URL acessível!');
        else console.error('❌ Erro ao acessar callback URL');
    })
    .catch(err => console.error('❌ Erro de rede:', err));
