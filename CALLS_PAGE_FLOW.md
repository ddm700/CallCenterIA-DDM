# Página Ligações: fluxo entre frontend, Supabase e tabela Histórico

Este documento descreve como a página **Ligações** funciona hoje no projeto, com foco em como a tabela **Histórico** recebe dados do Supabase e como esses dados chegam ao banco.

## Visão geral

O fluxo atual da página é:

`VAPI -> backend webhook -> Supabase (tabela calls) -> frontend -> tabela Histórico`

Em termos práticos:

1. A VAPI envia o resultado da chamada para o backend.
2. O backend grava ou atualiza a chamada no Supabase, na tabela `calls`.
3. O frontend da página `Ligações` consulta essa tabela via `supabaseService.getCalls()`.
4. Os registros retornados são exibidos na tabela **Histórico**.

## Onde a página carrega os dados

O componente da página está em:

- `pages/Calls.tsx`

Quando a página abre, a função `fetchCalls()` é executada no `useEffect`. Ela chama em paralelo:

- `supabaseService.getCalls()`
- `supabaseService.getCampaigns()`

Depois disso:

- `setCalls(callsData)` popula a lista de ligações
- `setAllCampaignNames(...)` popula os nomes usados nos filtros

Trechos relevantes:

- `pages/Calls.tsx:31` -> definição de `fetchCalls`
- `pages/Calls.tsx:35` -> chamada de `supabaseService.getCalls()`
- `pages/Calls.tsx:38` -> `setCalls(callsData)`
- `pages/Calls.tsx:47` -> `useEffect(() => { fetchCalls(); }, [])`
- `pages/Calls.tsx:254` -> título da seção `Histórico`
- `pages/Calls.tsx:256` -> botão de atualizar que chama `fetchCalls`

## Como a tabela Histórico é abastecida

A tabela **Histórico** renderiza os itens de `paginatedCalls`, que vêm de `calls`, e `calls` é preenchido pelo retorno de `supabaseService.getCalls()`.

Ou seja:

- o frontend não escreve direto na tabela Histórico
- a tabela Histórico é apenas uma renderização dos registros carregados do Supabase

## Consulta ao Supabase

A função responsável por buscar os dados está em:

- `services/supabaseService.ts`

Função:

- `getCalls(): Promise<Call[]>`

Essa função consulta diretamente a tabela `calls` no Supabase:

- `from('calls')`

Também faz join relacional com:

- `campaign_contacts`
- `contacts`
- `campaigns`

Objetivo desses joins:

- obter nome do cliente
- obter CPF
- obter telefone
- obter nome da campanha vinculada à chamada

Trechos relevantes:

- `services/supabaseService.ts:399` -> início de `getCalls()`
- `services/supabaseService.ts:401` -> `from('calls')`
- `services/supabaseService.ts:404` -> join com `campaign_contacts`
- `services/supabaseService.ts:416` -> ordenação por `started_at DESC`
- `services/supabaseService.ts:424` -> transformação dos dados retornados

## Como os dados do banco são transformados para a interface

Depois da consulta, o retorno bruto do Supabase é convertido para o tipo `Call`, definido em:

- `types.ts`

Campos principais usados pela tabela Histórico:

- `started_at -> date`
- `ended_reason -> reason`
- `success_evaluation -> success`
- `custo_total -> cost`
- `recording_url -> recordingUrl`
- `transcript -> transcript`
- `summary -> summary`

Também há fallback para recuperar dados do cliente e da campanha:

- nome da campanha via `call.campaign_name` ou `call.campaign_contacts?.campaigns?.nome`
- nome do cliente via `call.cliente` ou `call.campaign_contacts?.contacts?.nome`
- CPF via `call.cpf` ou `call.campaign_contacts?.contacts?.cpf`
- telefone via `call.customer_number` ou `call.campaign_contacts?.contacts?.telefone`

Trechos relevantes:

- `services/supabaseService.ts:431` -> fallback do nome da campanha
- `services/supabaseService.ts:455` -> conversão de `started_at` para data formatada
- `services/supabaseService.ts:462` -> `ended_reason`
- `services/supabaseService.ts:463` -> cálculo de `success`
- `services/supabaseService.ts:470` -> `recordingUrl`
- `types.ts:49` em diante -> interface `Call`

## Como a tabela Histórico exibe os dados

Na interface de `pages/Calls.tsx`, cada linha da tabela usa os campos do objeto `Call`:

- `call.date`
- `call.campaignName`
- `call.clientName`
- `call.phone`
- `call.duration`
- `call.status`
- `call.reason`
- `call.success`
- `call.cost`

Além disso, a coluna de ações pode abrir:

- a gravação, via `call.recordingUrl`
- o modal de detalhes, passando o objeto completo da chamada

O modal fica em:

- `components/CallDetailsModal.tsx`

Esse modal usa campos detalhados como:

- `transcript`
- `summary`
- `analysis`
- `metadata_raw`
- custos detalhados

## Quem grava na tabela `calls`

A página **Ligações** apenas lê os dados. Quem grava esses dados no Supabase é o backend.

O ponto principal é o webhook:

- `backend/src/routes/webhooks.ts`

Rota:

- `POST /vapi/callback`

Essa rota recebe eventos da VAPI. Quando chega um evento do tipo:

- `end-of-call-report`

o backend processa a chamada e persiste os dados no Supabase.

Trechos relevantes:

- `backend/src/routes/webhooks.ts:17` -> definição da rota

## Fluxo do webhook até o Supabase

O fluxo do backend é:

1. Recebe o payload enviado pela VAPI.
2. Extrai `call` e `metadata`.
3. Procura uma chamada já existente na tabela `calls` usando `vapi_call_id`.
4. Se não encontrar, tenta localizar uma chamada órfã pela `campaign_contact_id`.
5. Se ainda não encontrar, cria um novo registro em `calls` com status inicial `queued`.
6. Calcula duração, custos, gravação, transcrição, resumo e dados estruturados.
7. Atualiza o registro da chamada em `calls`.
8. Atualiza também o status do contato em `campaign_contacts`.

Trechos relevantes:

- `backend/src/routes/webhooks.ts:31` -> busca em `calls`
- `backend/src/routes/webhooks.ts:65` -> criação de registro em `calls`
- `backend/src/routes/webhooks.ts:114` -> montagem de `updateData`
- `backend/src/routes/webhooks.ts:140` -> gravação de `metadata_raw`
- `backend/src/routes/webhooks.ts:144` -> update final na tabela `calls`
- `backend/src/routes/webhooks.ts:150` -> leitura de `campaign_contacts`
- `backend/src/routes/webhooks.ts:170` -> update do status em `campaign_contacts`

## Dados salvos na tabela `calls`

O backend salva ou atualiza na tabela `calls` informações como:

- `vapi_call_id`
- `campaign_contact_id`
- `contact_phone_id`
- `started_at`
- `ended_at`
- `ended_reason`
- `duration_seconds`
- `custo_total`
- `custo_stt`
- `custo_tts`
- `custo_vapi`
- `summary`
- `success_evaluation`
- `transcript`
- `recording_url`
- `stereo_recording_url`
- `artifact_log_url`
- `assistant_id`
- `phone_number_id`
- `structured_name`
- `structured_rating_label`
- `structured_rating_text`
- `structured_purpose`
- `structured_main_points`
- `structured_next_steps`
- `structured_emotions_objections`
- `metadata_raw`
- `status`

Esses campos são a base que depois aparece na página Ligações.

## Atualização da tabela Histórico no frontend

Atualmente, a página **não usa realtime** do Supabase.

Isso significa:

- os dados são carregados quando a página abre
- os dados são recarregados quando o usuário clica no botão de atualizar

Portanto, a tabela **Histórico** não é atualizada automaticamente no momento em que o backend grava uma nova chamada, a menos que a página seja recarregada ou `fetchCalls()` seja executado novamente.

## Observação importante sobre a documentação

Existe uma divergência entre a documentação e a implementação atual.

No arquivo:

- `README_SQL.md`

há a indicação de que a página Ligações usaria:

- `vw_calls_history`
- `supabaseService.getCallsHistory()`

Mas o código atual da aplicação usa:

- `supabaseService.getCalls()`
- leitura direta da tabela `calls`

Ou seja:

- a documentação descreve uma abordagem baseada em view
- a implementação real hoje consulta a tabela `calls` diretamente

## Resumo final

A comunicação entre banco de dados no Supabase e a tabela **Histórico** da página **Ligações** ocorre assim:

1. A VAPI finaliza uma chamada e envia um callback ao backend.
2. O backend processa esse callback e grava os dados na tabela `calls` no Supabase.
3. A página `Ligações` chama `supabaseService.getCalls()`.
4. Essa função lê a tabela `calls` com joins relacionais.
5. O resultado é mapeado para objetos do tipo `Call`.
6. Esses objetos são exibidos na tabela **Histórico** do frontend.

Em resumo: a tabela Histórico é uma visualização frontend dos registros persistidos na tabela `calls` do Supabase.
