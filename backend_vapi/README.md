# vapi-campaign-backend

Backend local-first para:
- Importar Excel (200 a 1000 linhas)
- Consultar VAPI para listar assistentes e linhas
- Montar payload por contato
- Salvar campanha/contatos no Postgres
- Enfileirar 1 job por contato no Redis (BullMQ)
- Disparar webhook 1 por contato com delay (2s por padrão)

## Stack
- Fastify + Swagger UI (OpenAPI)
- ExcelJS (leitura de .xlsx)
- PostgreSQL
- Redis + BullMQ

## Como rodar local (dev)
1) Copie `.env.example` para `.env` e ajuste:
- `DATABASE_URL`
- `REDIS_*`
- `VAPI_*`

2) Instale:
```bash
npm i
```

3) Rode migração (cria tabelas):
```bash
npm run migrate:dev
```

4) Rode API:
```bash
npm run dev
```

5) Rode Worker (em outro terminal):
```bash
npm run worker:dev
```

## Swagger UI
Acesse:
- http://localhost:3000/docs

## Formato esperado do Excel
A primeira planilha deve conter cabeçalho. Colunas aceitas (case-insensitive):
- nome
- cpf
- instituicao
- telefone1
- telefone2
- telefone3

## Fluxo sugerido
1) `GET /vapi/assistants` e `GET /vapi/lines` para escolher `assistant_id` e `line_id`.
2) `POST /campaigns/import-excel` (multipart) com:
   - file: .xlsx
   - name: nome da campanha
   - assistant_id
   - line_id
   - webhook_url (opcional, pode deixar vazio por enquanto)
3) `POST /campaigns/:id/enqueue` para enfileirar os contatos (aplica delay).
4) Acompanhar status: `GET /campaigns/:id` e `GET /campaigns/:id/contacts`.

## Observações sobre rate limit / firewall
- O delay é aplicado na fila (não é sleep bloqueante).
- Por padrão: 2000ms entre contatos.
- Concurrency do worker é 1 (serial). Ajuste em `WORKER_CONCURRENCY` se necessário.
