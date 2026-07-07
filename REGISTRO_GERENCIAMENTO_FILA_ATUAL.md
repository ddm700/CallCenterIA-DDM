# Registro do gerenciamento de fila atual

Data do registro: 2026-07-06

Projeto registrado: `C:\Users\Jefferson.Rafael\Desktop\Projetos\ligacao\callcenteria-merge`

## Modelo atual antes da alteracao

O backend atual usa um modelo de processamento por ciclos curtos e retomaveis.

O endpoint `POST /api/campaigns/start` processa contatos elegiveis ate atingir um orcamento de tempo definido por `CAMPAIGN_DISPATCH_TIME_BUDGET_MS`. Ao final do ciclo, ele retorna um resumo informando quantos contatos foram processados e quantos continuam pendentes.

Arquivo principal:

- `backend/src/routes/campaigns.ts`

Variaveis principais:

- `CAMPAIGN_START_MAX_CONCURRENCY`, default `1`
- `CAMPAIGN_START_REQUEST_INTERVAL_MS`, default `5000`
- `CAMPAIGN_DISPATCH_TIME_BUDGET_MS`, default `45000`
- `CAMPAIGN_START_MAX_RETRIES`, default `5`
- `CAMPAIGN_START_RETRY_BASE_MS`, default `2000`
- `CAMPAIGN_START_RETRY_MAX_MS`, default `30000`

## Fluxo atual

1. O backend busca a campanha.
2. Valida se a campanha esta ativa e dentro da janela de horario.
3. Busca contatos `campaign_contacts` com `status = 'pendente'`.
4. Filtra contatos elegiveis por:
   - `max_tentativas`
   - `ultima_tentativa`
   - `intervalo_minutos`
5. Envia chamadas ao n8n respeitando:
   - concorrencia maxima da env
   - concorrencia da campanha (`ligacoes_simultaneas`)
   - intervalo minimo entre requisicoes
6. A cada dispatch aceito pelo n8n:
   - cria/reutiliza registro em `calls` com `status = 'queued'`
   - atualiza `campaign_contacts` para `status = 'em_andamento'`
   - incrementa `tentativas_realizadas`
   - atualiza `ultima_tentativa`
7. Quando o prazo do ciclo acaba, o backend para de proposito.
8. Contatos restantes continuam como `pendente`.

## Retomada atual

A retomada pode acontecer por nova chamada a `POST /api/campaigns/start` ou pelo endpoint:

- `GET /api/campaigns/dispatch-cron`

Esse endpoint exige `CRON_SECRET` e processa campanhas ativas dentro do mesmo modelo de orcamento de tempo.

## Caracteristica operacional

Com defaults atuais:

- concorrencia `1`
- intervalo `5000ms`
- orcamento `45000ms`

Cada ciclo processa aproximadamente 9 a 10 contatos. Em uma campanha com 2000 contatos, seriam necessarios aproximadamente 200 ciclos.

## Diferenca em relacao ao backup

O projeto `callcenteria-merge-backup-2026-04-22` usa outro modelo:

- `POST /api/campaigns/start` responde `202` imediatamente.
- O processamento continua em background.
- Os contatos sao processados em lotes por `CAMPAIGN_START_BATCH_SIZE`, default `500`.
- Entre lotes existe pausa por `CAMPAIGN_START_PAUSE_MS`, default `90000`.
- O endpoint nao usa o modelo de orcamento de tempo nem `dispatch-cron`.
