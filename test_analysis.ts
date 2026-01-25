
import { supabase } from './lib/supabaseClient';

async function checkCallAnalysis() {
    const { data, error } = await supabase
        .from('calls')
        .select('id, analysis, summary, ended_reason')
        .eq('success_evaluation', false)
        .not('analysis', 'is', null) // Tenta pegar uma com análise
        .limit(3);

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Calls Data:', JSON.stringify(data, null, 2));
    }
}

// Como não posso executar TS direto, vou apenas injetar esse código num arquivo .js se eu soubesse as credenciais, 
// mas como não sei, vou CRIAR um código temporário no próprio App para "logar" isso no console do browser (se eu estivesse lá).
// Mas espere, eu sou o dev. Eu vou alterar o frontend para fazer esse console.log na montagem e ver o resultado? Não, eu não vejo o console do browser.

// Alternativa: Inspecionar o código 'pages/Calls.tsx' para ver se ele já usa analysis ou o que.
// Aliás, eu vi em types.ts que `analysis` é any.
