# Resumo da lógica de gerenciamento de filas

O projeto usa uma lógica de filas híbrida, combinando banco de dados, backend e RabbitMQ.

## Resumo rápido

Existem 3 peças principais:

1. `campaign_contacts` funciona como a fila operacional real.
2. O backend escolhe quais contatos podem ser processados agora.
3. O RabbitMQ segura pedidos técnicos de dispatch de chamadas.

## Como pensar nessa arquitetura

- `campaign_contacts` diz quem ainda precisa ser tentado.
- O backend filtra quem está elegível.
- As chamadas são disparadas em lotes e com concorrência controlada.
- O RabbitMQ desacopla o pedido de ligação da execução.
- O webhook decide se o contato sai da fila ou volta para ela.

## Fila no banco

A tabela `campaign_contacts` é o núcleo da fila de negócio.

Status principais:

- `pendente`: pode ser tentado novamente
- `em_andamento`: já foi despachado
- `concluido`: saiu da fila com sucesso
- `falhou`: saiu da fila por excesso de tentativas

Além do status, o sistema usa:

- `tentativas_realizadas`
- `ultima_tentativa`

Esses campos controlam se o contato ainda pode entrar em uma nova rodada.

## Papel do RabbitMQ

O RabbitMQ é usado como fila técnica de dispatch.

Fluxo:

1. A API monta o payload da ligação.
2. Publica na fila `call.dispatch`.
3. Um worker consome essa mensagem.
4. O worker chama o n8n/VAPI.

Isso evita que a requisição original precise executar toda a ligação na hora.

## Papel do backend nas campanhas

Para campanhas, o backend:

1. Busca contatos com status `pendente` ou `em_andamento`.
2. Remove quem não está elegível.
3. Processa em lotes.
4. Limita a concorrência.
5. Faz pausa entre lotes.

Também existe um bloqueio em memória para impedir duas execuções simultâneas da mesma campanha.

## Controle de ritmo

O projeto usa:

- concorrência máxima
- tamanho de lote
- pausa entre lotes
- intervalo mínimo entre requests
- retry com backoff

Isso serve para evitar rajadas excessivas no n8n/VAPI.

## Papel do webhook

Quando a chamada termina, o webhook:

1. grava o histórico em `calls`
2. atualiza o `campaign_contact`

Depois disso, o contato pode:

- virar `concluido`
- virar `falhou`
- voltar para `pendente`

## Diferença entre `calls` e `campaign_contacts`

- `calls` guarda o histórico das chamadas
- `campaign_contacts` guarda a fila operacional

## Resumo final

Em uma frase:

O projeto usa o banco como fila de trabalho, o backend como orquestrador de execução e o RabbitMQ como fila técnica de despacho.
