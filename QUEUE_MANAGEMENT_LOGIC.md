# Lógica de gerenciamento de filas no projeto

Este documento explica, de forma simples e detalhada, como funciona a lógica de filas empregada neste projeto.

## Visão geral

O projeto não usa apenas uma fila única.

Na prática, ele combina **três mecanismos diferentes**:

1. Uma fila de negócio no banco de dados, baseada na tabela `campaign_contacts`.
2. Uma fila técnica no RabbitMQ, usada para despacho de chamadas individuais.
3. Um orquestrador de campanha no backend, que processa contatos em lotes com concorrência controlada.

Em termos simples:

- o banco decide **quem ainda precisa ser tentado**
- o backend decide **quando e em que ritmo isso será processado**
- o RabbitMQ segura os pedidos técnicos de ligação
- o webhook decide **se o contato sai da fila ou volta para ela**

## Arquivos principais

Os pontos centrais dessa lógica estão em:

- `backend/src/routes/calls.ts`
- `backend/src/queues/callDispatch.ts`
- `backend/src/queues/callDispatchWorker.ts`
- `backend/src/queues/rabbitmq.ts`
- `backend/src/services/callDispatch.ts`
- `backend/src/routes/campaigns.ts`
- `backend/src/routes/webhooks.ts`
- `backend/src/config/env.ts`

## Modelo mental simples

Pense na arquitetura assim:

1. `campaign_contacts` funciona como a fila operacional real.
2. Quando o sistema decide ligar para alguém, ele gera um pedido técnico de dispatch.
3. Esse pedido pode ser enfileirado no RabbitMQ.
4. Um worker consome a fila e chama o webhook do n8n/VAPI.
5. Quando a chamada termina, o webhook grava o resultado no banco.
6. A partir do resultado, o contato pode:
   - sair da fila
   - continuar em andamento
   - voltar para pendente
   - falhar definitivamente

## 1. A fila de negócio no banco

A fila mais importante do projeto não está no RabbitMQ.

Ela está no banco, principalmente na tabela:

- `campaign_contacts`

Essa tabela representa o estado operacional de cada contato dentro de uma campanha.

Os campos mais importantes para a lógica de fila são:

- `status`
- `tentativas_realizadas`
- `ultima_tentativa`

Os status relevantes são:

- `pendente`: o contato ainda pode ser trabalhado novamente
- `em_andamento`: o contato já foi despachado para tentativa
- `concluido`: o contato saiu da fila porque teve sucesso
- `falhou`: o contato saiu da fila porque esgotou as tentativas

### Interpretação prática

Essa tabela funciona como uma fila de trabalho persistente:

- se um contato está `pendente`, ele pode entrar na próxima rodada
- se está `em_andamento`, ele já foi enviado para processamento
- se está `concluido`, ele não volta
- se está `falhou`, ele também não volta

Por isso, a fila de negócio do sistema não depende só de ordem.

Ela depende do conjunto:

- status do contato
- quantidade de tentativas
- intervalo entre tentativas

## 2. Fila técnica com RabbitMQ

Além da fila lógica no banco, o projeto usa RabbitMQ para enfileirar pedidos técnicos de despacho de ligação.

O nome padrão da fila é:

- `call.dispatch`

Isso vem de:

- `RABBITMQ_CALL_DISPATCH_QUEUE`

Configuração em:

- `backend/src/config/env.ts`

Também existe:

- `RABBITMQ_PREFETCH`

Valor default atual:

- `6`

### O que essa fila faz

O RabbitMQ aqui serve como um buffer entre:

- quem pede a ligação
- quem realmente executa o envio para n8n/VAPI

Ou seja:

- a requisição HTTP não precisa executar a ligação imediatamente
- ela apenas publica uma mensagem na fila
- o worker pega essa mensagem depois

### Benefícios disso

- desacoplamento entre API e execução
- absorção de picos
- menor risco de travar a requisição original
- possibilidade de controlar consumo separadamente

## 3. Como uma ligação manual entra na fila

Quando uma ligação individual é iniciada, a rota:

- `POST /calls/initiate`

processa a entrada.

Arquivo:

- `backend/src/routes/calls.ts`

### O que a rota faz

1. Valida telefone e nome.
2. Verifica se RabbitMQ está configurado.
3. Busca CPF, se houver `contactId`.
4. Busca dados da campanha, se houver `campaignId`.
5. Tenta localizar o `campaign_contact`.
6. Se achar o `campaign_contact`, marca esse item como `em_andamento`.
7. Monta o payload da ligação.
8. Publica esse payload na fila RabbitMQ.

### O payload enviado para a fila

O payload é montado em:

- `backend/src/queues/callDispatch.ts`

Campos principais:

- `type`
- `source`
- `contactId`
- `campaignContactId`
- `campaignId`
- `phoneId`
- `customerNumber`
- `customerName`
- `customerCpf`
- `assistantId`
- `phoneNumberId`
- `callbackUrl`
- `tipoTelefonia`
- `queuedAt`

Esse objeto representa uma ordem técnica para disparar uma ligação.

## 4. Como o RabbitMQ publica as mensagens

Arquivo:

- `backend/src/queues/rabbitmq.ts`

### Comportamento

Ao publicar:

- a fila é garantida com `assertQueue(queueName, { durable: true })`
- a mensagem é enviada com `persistent: true`

Isso significa que:

- a fila é durável
- a mensagem é persistente
- o projeto tenta reduzir risco de perda em reinícios ou falhas do broker

Também existe uma proteção para backpressure:

- se `sendToQueue(...)` retornar falso
- o código espera o evento `drain`

Em linguagem simples:

- se o canal estiver momentaneamente saturado
- o publicador espera antes de continuar

## 5. Como o worker consome a fila

Arquivo:

- `backend/src/queues/callDispatchWorker.ts`

### Fluxo

O worker:

1. Abre a fila.
2. Configura `prefetch`.
3. Faz `consume(...)`.
4. Lê cada mensagem.
5. Faz parse do JSON.
6. Chama o despachador real.
7. Dá `ack` ou `nack` conforme o caso.

### O que `prefetch` significa

Se `prefetch = 6`, o worker pode ficar com até 6 mensagens entregues e ainda não confirmadas.

Na prática:

- o RabbitMQ não despeja infinitas mensagens de uma vez
- ele respeita um limite de trabalho pendente no consumidor

### ACK e NACK

O worker usa duas estratégias:

- `ack`: confirma que a mensagem foi processada
- `nack(..., true)`: devolve a mensagem para reprocessamento

### Regra importante

Se o dispatch retornar uma falha de negócio, o código apenas registra erro e faz `ack`.

Ou seja:

- nem toda falha volta para a fila RabbitMQ

Só erros inesperados de execução do worker fazem `nack` com requeue.

Isso quer dizer que o RabbitMQ não está sendo usado como um sistema completo de retry por regra de negócio.

Ele está sendo usado como um mecanismo técnico de entrega assíncrona.

## 6. O despachador real e o controle de ritmo

Arquivo:

- `backend/src/services/callDispatch.ts`

Esse serviço é responsável por:

- descobrir a URL do webhook do n8n
- montar headers
- enviar o payload
- aplicar retry
- respeitar um intervalo mínimo entre requisições

### O `RequestPacer`

O `RequestPacer` funciona como um controlador de espaçamento entre requests.

Ele garante que duas chamadas não saiam rápidas demais uma atrás da outra.

Em termos simples:

- cada request reserva sua vez
- se ainda não chegou a hora, ele espera
- depois envia

Configuração default:

- `CAMPAIGN_START_REQUEST_INTERVAL_MS = 250`

Isso ajuda a evitar:

- rajadas agressivas no n8n
- excesso de requisições na VAPI
- bloqueios por rate limit

## 7. Retry e backoff

O envio usa:

- `postWebhookWithRetries(...)`

### Regras principais

- se a resposta for sucesso, encerra
- se a resposta for `429`, tenta novamente
- usa `Retry-After` quando disponível
- se não houver `Retry-After`, usa backoff exponencial com jitter
- respeita limite máximo de tentativas

Configurações padrão:

- `CAMPAIGN_START_MAX_RETRIES = 5`
- `CAMPAIGN_START_RETRY_BASE_MS = 2000`
- `CAMPAIGN_START_RETRY_MAX_MS = 30000`

### Significado prático

Se o downstream estiver pedindo para desacelerar:

- o sistema reduz o ritmo
- espera
- e tenta novamente sem martelar o serviço

## 8. A execução de campanhas não usa RabbitMQ como fila principal

Esse é um ponto importante.

O processamento de campanhas em lote é feito em:

- `backend/src/routes/campaigns.ts`

Ele usa:

- leitura paginada no banco
- filtragem de elegibilidade
- concorrência controlada em memória
- processamento por lotes
- pausa entre lotes

Ou seja:

- para campanhas, o projeto usa um orquestrador próprio
- não depende exclusivamente da fila RabbitMQ

## 9. Proteção contra dupla execução da mesma campanha

No arquivo:

- `backend/src/routes/campaigns.ts`

há um conjunto em memória:

- `activeCampaignRuns`

Esse conjunto guarda os IDs das campanhas que estão em execução.

### Finalidade

Evitar que a mesma campanha seja iniciada duas vezes ao mesmo tempo.

Se já existir uma execução em andamento para o mesmo `campaignId`, a rota responde erro:

- `Ja existe uma execucao em andamento para esta campanha`

### Limitação

Esse controle é em memória local do processo Node.

Isso significa:

- funciona bem em instância única
- não é um lock distribuído
- se houver múltiplas instâncias, esse controle sozinho não basta

## 10. Como o backend escolhe quem entra na rodada

Durante a execução da campanha, o backend busca `campaign_contacts` com:

- `status in ('pendente', 'em_andamento')`

Depois aplica filtros de elegibilidade.

### Regras de elegibilidade

O contato só entra se:

- ainda não atingiu `max_tentativas`
- respeitou o `intervalo_minutos`
- a campanha está ativa
- a campanha está dentro da janela de horário, se essa regra estiver habilitada

### Em termos simples

Nem todo contato presente na tabela pode ser executado agora.

O sistema pergunta:

- pode ligar para esse contato neste momento?

Se a resposta for não, ele fica fora da rodada atual.

## 11. Busca de telefones e estratégia defensiva

O backend também busca telefones da tabela `contact_phones`.

Essa busca usa chunks.

Se ocorrer erro do tipo overflow de headers ou falha relacionada ao tamanho da operação:

- o código reduz o tamanho do chunk
- e tenta novamente com blocos menores

Isso é uma proteção contra falhas em consultas grandes demais.

## 12. Processamento por lotes

Depois que os contatos elegíveis são definidos, o sistema não tenta processar tudo de uma vez.

Ele quebra em lotes usando:

- `CAMPAIGN_START_BATCH_SIZE`

Valor padrão:

- `500`

### Comportamento

1. Pega um lote.
2. Processa o lote com concorrência limitada.
3. Registra quantos tiveram sucesso e quantos falharam.
4. Se houver mais lotes, espera um intervalo.
5. Vai para o próximo lote.

Pausa padrão entre lotes:

- `CAMPAIGN_START_PAUSE_MS = 90000`

Ou seja:

- 90 segundos entre lotes, por padrão

## 13. Concorrência controlada

A função:

- `processWithConcurrency(...)`

controla quantos contatos são trabalhados ao mesmo tempo.

Configuração padrão:

- `CAMPAIGN_START_MAX_CONCURRENCY = 6`

### Significado prático

Se houver 500 contatos no lote:

- não serão processados 500 simultaneamente
- serão processados até 6 por vez

Quando um termina:

- o próximo entra

Essa é uma fila de execução em memória, controlada pelo backend.

## 14. Distribuição entre linhas VAPI

Se a campanha usa VAPI e possui várias linhas:

- as linhas são embaralhadas
- o sistema vai alternando entre elas conforme o índice do contato

Isso não é uma fila separada por linha.

É apenas uma estratégia simples para distribuir o tráfego entre linhas disponíveis.

## 15. O que acontece quando o contato é disparado

Durante o processamento da campanha:

1. O sistema monta o payload do contato.
2. Chama o webhook do n8n.
3. Se o dispatch for aceito, atualiza `campaign_contacts`.

A atualização típica é:

- `status = em_andamento`
- `tentativas_realizadas = tentativas_realizadas + 1`
- `ultima_tentativa = agora`

### Importância disso

Esse passo é essencial para a fila funcionar corretamente.

Ele impede que o mesmo contato continue parecendo disponível como se nunca tivesse sido tentado.

## 16. Onde o ciclo fecha: webhook de fim de chamada

O fechamento do ciclo acontece em:

- `backend/src/routes/webhooks.ts`

Rota:

- `POST /vapi/callback`

Quando a VAPI envia o relatório final da chamada:

- o backend localiza ou cria um registro na tabela `calls`
- salva duração, motivo, resumo, transcrição, gravação, custos e metadata
- depois decide o novo estado do `campaign_contact`

## 17. Relação entre `calls` e `campaign_contacts`

Essas duas tabelas têm papéis diferentes:

- `calls` guarda histórico de chamadas executadas
- `campaign_contacts` guarda o estado da fila de trabalho

### Resumo

- `calls` = histórico
- `campaign_contacts` = fila operacional

Essa separação é importante porque:

- o sistema consegue manter rastreabilidade completa das ligações
- sem misturar isso com o controle de quem ainda precisa ser tentado

## 18. Como o webhook decide se o contato volta ou sai da fila

No webhook, após o fim da chamada, o sistema calcula o novo status do `campaign_contact`.

### Regras principais

O contato vira `concluido` se:

- `successEvaluation === 'true'`

Ou também pode virar `concluido` quando:

- o encerramento é interpretado como bem-sucedido
- e a chamada atingiu duração mínima suficiente

O contato vira `falhou` se:

- atingiu o limite máximo de tentativas

O contato volta para `pendente` se:

- o motivo de encerramento for tratado como falha técnica

### Interpretação prática

Se a falha parece recuperável:

- o contato volta para a fila

Se a chamada teve sucesso:

- o contato sai da fila

Se o sistema já tentou demais:

- o contato sai da fila como falha final

## 19. Exemplo simples de fluxo de um contato

### Cenário 1: sucesso

1. O contato entra na campanha com status `pendente`.
2. A campanha encontra esse contato como elegível.
3. O backend despacha a ligação.
4. O contato vira `em_andamento`.
5. A VAPI finaliza a chamada e envia callback.
6. O webhook registra a chamada em `calls`.
7. O webhook define `campaign_contact.status = concluido`.
8. O contato sai da fila operacional.

### Cenário 2: falha técnica recuperável

1. O contato está `pendente`.
2. O backend tenta despachar.
3. A chamada ocorre, mas termina com falha técnica.
4. O webhook registra a chamada em `calls`.
5. O webhook devolve o contato para `pendente`.
6. Em próxima rodada, o contato pode ser tentado de novo.

### Cenário 3: limite de tentativas atingido

1. O contato já foi tentado várias vezes.
2. O backend ainda consegue disparar a última tentativa válida.
3. O resultado não é satisfatório.
4. O webhook verifica que o limite foi atingido.
5. O contato vira `falhou`.
6. Ele não volta mais para a fila.

## 20. O que o projeto tenta evitar com essa arquitetura

Essa lógica foi desenhada para evitar os seguintes problemas:

- disparar chamadas demais ao mesmo tempo
- reprocessar o mesmo contato sem controle
- tentar novamente antes do intervalo mínimo
- iniciar a mesma campanha em paralelo
- sobrecarregar n8n ou VAPI com rajadas
- perder o histórico detalhado do que aconteceu

## 21. Limitações atuais da abordagem

Apesar de funcionar bem, existem limitações claras:

### `activeCampaignRuns` é local

O bloqueio de campanha em execução fica só em memória.

Então:

- funciona em um processo Node único
- não é suficiente para múltiplas instâncias

### RabbitMQ não faz retry de regra de negócio

Falhas de dispatch nem sempre retornam para a fila RabbitMQ.

Então:

- o reprocessamento principal continua sendo controlado pela lógica do banco e do webhook

### Campanha usa orquestração própria

O fluxo em lote da campanha não está totalmente centralizado no RabbitMQ.

Então o projeto usa:

- fila técnica para dispatch individual
- e scheduler próprio para campanha

## 22. Resumo final

A lógica de filas do projeto é híbrida.

Ela funciona assim:

1. A tabela `campaign_contacts` representa a fila real de trabalho.
2. O backend seleciona apenas contatos elegíveis.
3. O processamento acontece em lotes e com concorrência limitada.
4. O `RequestPacer` controla o ritmo das requisições.
5. O RabbitMQ segura pedidos técnicos de dispatch.
6. O worker consome esses pedidos e chama o n8n/VAPI.
7. O webhook grava o resultado e redefine o estado do contato.
8. Com isso, o contato pode sair da fila, falhar ou voltar para nova tentativa.

Em uma frase:

O projeto usa o banco como fila operacional, o RabbitMQ como fila técnica de despacho e o webhook como mecanismo de decisão sobre reentrada ou saída da fila.
