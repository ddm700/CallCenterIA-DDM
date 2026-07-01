# Por que 10.000 contatos importados geravam só ~300 chamadas (e como foi corrigido)

Este documento explica, de forma simples, o bug encontrado no disparo de campanhas em massa
e a correção aplicada em `backend/src/routes/campaigns.ts`.

## 1. O sintoma

Em 30/06/2026, uma campanha recebeu ~10.000 contatos importados, mas depois de um tempo
só ~300 chamadas tinham sido efetivamente disparadas. O restante ficou parado, sem erro
visível na tela, sem nada "quebrado" — simplesmente nada mais acontecia.

## 2. Uma analogia antes do código

Imagine um garçom que decide servir 400 mesas *numa única viagem à cozinha*: ele pega o
primeiro pedido, entrega, espera 5 segundos "pra não sobrecarregar a cozinha", pega o
próximo, entrega, espera de novo... e assim por 400 pedidos, sem nunca voltar pro salão.

Isso funcionaria se o garçom pudesse trabalhar por horas sem parar. Só que esse garçom é um
**funcionário terceirizado que só pode trabalhar 60 segundos por chamado** (isso é uma
função serverless da Vercel). Depois de 60 segundos ele é *literalmente desligado* pela
empresa que o contratou, no meio da tarefa, sem aviso. Ele não anota onde parou. Se
ninguém chamar ele de novo, o resto dos pedidos nunca sai da fila.

Era exatamente isso que acontecia com `/api/campaigns/start`.

## 3. O código antigo (simplificado)

```ts
// backend/src/routes/campaigns.ts (ANTES)
for (let i = 0; i < contatos.length; i += 25) {           // pega 25 contatos
  const lote = contatos.slice(i, i + 25);

  for (const contato of lote) {
    await ligarPara(contato);        // 1 requisição HTTP ao n8n
    await esperar(5_000);            // espera 5s antes do próximo
  }

  await esperar(90_000);             // espera 90s antes do próximo lote de 25
}
```

Essa função inteira rodava **dentro de uma única requisição HTTP** disparada quando alguém
clicava em "Iniciar campanha". E essa requisição, na Vercel, é uma *serverless function* —
que tem um tempo máximo de execução (tipicamente entre 10s e 60s, dependendo do plano).

### Fazendo a conta

```
10.000 contatos / 25 por lote = 400 lotes

tempo de 1 lote  = 25 contatos × 5s (espera entre chamadas)  = 125s
                  + 90s (pausa entre lotes)                  = 215s

tempo total       = 400 lotes × 215s ≈ 86.000s ≈ 24 horas
```

**A função precisaria rodar por 24 horas ininterruptas para terminar. A Vercel mata a
função depois de segundos.** Ela era interrompida sempre no mesmo lugar, mais ou menos
depois do mesmo tempo — o que explica por que sempre sobrava uma quantidade grande de
contatos parados como `pendente` no banco, e nenhum cron ou processo em background existia
para retomar o trabalho de onde parou.

## 4. A correção: dividir o trabalho em "turnos" curtos e retomáveis

A ideia da correção é simples: em vez de tentar processar os 10.000 contatos numa única
execução gigante, cada chamada a `/api/campaigns/start` processa **o quanto conseguir
dentro de um orçamento de tempo curto** (45 segundos, por padrão) e **devolve o controle**,
deixando claro quantos contatos ainda restam.

```ts
// backend/src/routes/campaigns.ts (DEPOIS)
const prazo = Date.now() + 45_000;   // "orçamento de tempo" desse turno

while (aindaTemContatoElegivel()) {
  if (Date.now() >= prazo) break;    // acabou o tempo? para AQUI, sem perder nada.

  await ligarPara(proximoContato()); // continua pra fila igual antes (com pacing/retries)
}

return {
  totalProcessado,
  restantesPendentes,     // quantos ainda faltam
  completed: restantesPendentes === 0
};
```

Nada muda na forma de discar (mesmo `RequestPacer`, mesmos retries com backoff). A única
diferença é que a função **para de propósito antes do tempo acabar**, em vez de ser morta
no meio de uma chamada.

## 5. Quem retoma o trabalho? O `dispatch-cron`

Parar educadamente não resolve tudo por si só — alguém precisa *chamar de novo*. Para isso,
foi criado um novo endpoint:

```
GET /api/campaigns/dispatch-cron
```

Ele faz o seguinte, em português simples: *"veja todas as campanhas ativas, e para cada
uma que ainda tiver contato pendente, processe um turno de até 45 segundos"*.

E quem chama esse endpoint sozinho, sem ninguém precisar lembrar de clicar em nada? Um
**Vercel Cron Job**, configurado em `vercel.json`, que dispara essa chamada automaticamente
a cada 1 minuto:

```json
"crons": [
  { "path": "/api/campaigns/dispatch-cron", "schedule": "*/1 * * * *" }
]
```

Voltando à analogia do garçom: agora existe um gerente (o cron) que, a cada minuto, chama
o garçom de novo e diz "continua de onde parou". O garçom (a função serverless) ainda só
trabalha por um tempo curto por vez, mas ele nunca mais fica esquecido no meio da tarefa —
alguém sempre o chama de volta.

### Por que o endpoint pede uma senha (`CRON_SECRET`)?

Esse endpoint, quando chamado, **dispara ligações reais de telefone**. Se qualquer pessoa
na internet pudesse chamá-lo, poderia forçar a discagem em massa de qualquer campanha
ativa. Por isso ele exige um cabeçalho de autenticação:

```
Authorization: Bearer <CRON_SECRET>
```

A Vercel envia esse cabeçalho automaticamente quando a variável de ambiente `CRON_SECRET`
está configurada no projeto — por isso é preciso configurar a mesma variável no backend
**e** no painel da Vercel.

## 6. O que aconteceu com os "lotes de 25 + pausa de 90s"?

Esse controle de ritmo (batch de 25 / pausa de 90s) existia para não sobrecarregar o n8n
e a VAPI de uma vez só. Ele foi removido porque, na prática, já existe outro controle de
ritmo fazendo esse trabalho: o **intervalo mínimo entre requisições**
(`CAMPAIGN_START_REQUEST_INTERVAL_MS`, 5 segundos por padrão), que continua existindo e
sendo respeitado — só que agora de forma contínua, sem as pausas longas de 90 segundos que
não tinham motivo real além de "descansar" um processo que, de qualquer forma, nunca teria
tempo de terminar.

## 7. Resumo visual: antes x depois

```
ANTES
-----
[clique em "Iniciar"] -> [1 requisição HTTP tentando processar 10.000 contatos]
                                   |
                                   v
                    (precisaria de ~24h pra terminar)
                                   |
                                   v
                    Vercel mata a função em ~60s
                                   |
                                   v
                 ~9.700 contatos ficam "pendente" pra sempre
                     (ninguém nunca os retoma)


DEPOIS
------
[clique em "Iniciar"]           -> processa 45s, devolve "faltam 9.760"
[cron, 1 min depois]            -> processa 45s, devolve "faltam 9.520"
[cron, 1 min depois]            -> processa 45s, devolve "faltam 9.280"
        ...                          (se repete automaticamente)
[cron, N minutos depois]        -> processa 45s, devolve "faltam 0" (concluído)
```

## 8. Validação: teste de carga com 2.000 requisições

Para confirmar que a correção realmente funciona sob carga, foi feito um teste com 2.000
contatos sintéticos (números inválidos, para não discar para ninguém de verdade),
disparados de fato contra o webhook real do n8n.

Resultado:

| Métrica | Valor |
|---|---|
| Total processado | 2.000 / 2.000 |
| Falhas de dispatch | 0 |
| Ciclos (turnos de 45-60s) até concluir | 9 |
| Tempo total | ~8,5 minutos |

Ou seja: em vez de uma única requisição tentando (e falhando em) processar tudo de uma vez,
o trabalho foi dividido em 9 turnos curtos — exatamente como aconteceria em produção com o
`dispatch-cron` rodando a cada minuto — e **nenhum contato ficou perdido no meio do
caminho**.

## 9. Arquivos alterados

| Arquivo | O que mudou |
|---|---|
| `backend/src/routes/campaigns.ts` | Loop com orçamento de tempo em vez de lote fixo + pausa; novo endpoint `/dispatch-cron` |
| `backend/src/config/env.ts` | Removidas `CAMPAIGN_START_BATCH_SIZE`/`CAMPAIGN_START_PAUSE_MS`; adicionadas `CAMPAIGN_DISPATCH_TIME_BUDGET_MS` e `CRON_SECRET` |
| `backend/.env.example` | Documentação das novas variáveis |
| `api/campaigns/dispatch-cron.ts` | Novo arquivo de rota serverless da Vercel para o endpoint de retomada |
| `vercel.json` | `maxDuration` explícito nas functions + cron job chamando `/api/campaigns/dispatch-cron` a cada minuto |

## 10. O que falta configurar em produção

1. Definir `CRON_SECRET` (uma string aleatória) tanto no backend quanto nas env vars do
   projeto na Vercel — precisam ser idênticas.
2. Fazer o deploy (a Vercel lê o `crons` do `vercel.json` automaticamente).
3. Se o projeto estiver no **plano Hobby** da Vercel, Cron Jobs só rodam 1x por dia, não a
   cada minuto — nesse caso é preciso um trigger externo (por exemplo, um Schedule Trigger
   no próprio n8n) chamando o mesmo endpoint autenticado com mais frequência.
