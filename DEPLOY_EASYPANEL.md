# Deploy na EasyPanel (MVP)

## Arquitetura
- 1 container Node:
  - serve frontend React buildado (`/`)
  - expõe backend API (`/api/*`)
- Porta interna: `4000`

## Variáveis de ambiente (runtime)
Configurar na app da EasyPanel:

- `PORT=4000`
- `FRONTEND_ORIGIN=https://SEU_DOMINIO`
- `BACKEND_PUBLIC_URL=https://SEU_DOMINIO`
- `SUPABASE_URL=...`
- `SUPABASE_SERVICE_ROLE_KEY=...`
- `SUPABASE_ANON_KEY=...` (opcional, compatibilidade)
- `REDIS_URL=redis://...` (opcional, cache)

## Build args (frontend no Docker build)
Se quiser fixar no build:

- `VITE_SUPABASE_URL=...`
- `VITE_SUPABASE_ANON_KEY=...`
- `VITE_N8N_WEBHOOK_VAPI=...` (opcional)
- `VITE_N8N_WEBHOOK_WHATSAPP=...` (opcional)

## Docker
- `Dockerfile` na raiz já pronto.
- `.dockerignore` já pronto.

## Endpoints importantes
- Health: `GET /health`
- Callback VAPI/n8n: `POST /api/webhooks/vapi/callback`
- Recursos VAPI: `GET /api/vapi/resources`

## Configuração do callback (VAPI/n8n)
Usar:

`https://SEU_DOMINIO/api/webhooks/vapi/callback`

## Redis
- Se `REDIS_URL` estiver preenchida, o endpoint `GET /api/vapi/resources` usa cache (TTL 120s).
- Sem Redis, o sistema continua funcionando normalmente.
