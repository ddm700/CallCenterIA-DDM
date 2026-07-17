# Post-mortem: Execução Local com Headless

## Objetivo
Registrar o que foi encontrado ao executar a aplicação localmente em modo headless, quais foram as causas reais, quais correções foram aplicadas e quais lições ficam para próximas investigações.

## Contexto
Durante a validação local da SPA, o backend subia corretamente e o frontend respondia em HTTP, mas isso não significava que a aplicação estivesse funcional no navegador. Por isso a validação foi feita em camadas:

1. Build de frontend e backend
2. Subida local dos serviços
3. Navegação real em Chrome headless
4. Captura de `console.error`, exceptions, alerts e falhas de rede

## Sintomas observados

### 1. Build do frontend falhou no sandbox com `spawn EPERM`
- Sintoma inicial: parecia um erro do projeto.
- Diagnóstico: o mesmo build passou fora do sandbox.
- Conclusão: era limitação do ambiente de execução, não falha do código.

### 2. A SPA abria, mas várias rotas falhavam logo após o carregamento
- Rotas afetadas inicialmente: `/`, `/#/contacts`, `/#/calls`, `/#/reports`, `/#/quality`, `/#/logs`
- Sinais no navegador:
  - `console.error`
  - `alert` dizendo que o Supabase não estava configurado
  - módulos entrando em modo degradado

### 3. A tela de qualidade ainda gerava erro mesmo depois da correção principal
- Sintoma: consulta de `top objections` retornando `400`.
- Efeito: erro persistente em headless durante a coleta das rotas.

### 4. Havia ruído operacional no diagnóstico
- `404` para `favicon.ico`
- recomendação do Chrome sobre campos `password` fora de `form`
- warning do Tailwind CDN

## Causas raiz

### Causa raiz 1: divergência entre env do backend e env do frontend
O backend usava `SUPABASE_*`, mas o frontend dependia de `VITE_SUPABASE_*`.

Na prática:
- o `.env` tinha `SUPABASE_URL` e `SUPABASE_ANON_KEY`
- o cliente lia `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
- no browser, o Vite só expõe automaticamente variáveis com prefixo `VITE_`

Resultado:
- a aplicação carregava
- mas o frontend iniciava sem credenciais válidas
- vários módulos quebravam no `mount`

### Causa raiz 2: configuração salva pela UI não batia com o backend
A UI salvava o webhook n8n com nomes diferentes dos que o backend consultava.

Resultado:
- o usuário podia “salvar” a configuração
- mas o backend podia continuar usando fallback

### Causa raiz 3: consulta incompatível com o tipo real do campo
A área de qualidade fazia filtro assumindo booleano em `success_evaluation`, mas o comportamento real do projeto indicava uso textual (`'true'` / `'false'`).

Resultado:
- a consulta de objeções retornava `400`
- a tela de qualidade seguia com erro mesmo após o bootstrap do Supabase estar resolvido

### Causa raiz 4: risco de falso diagnóstico por dev server antigo
Mudanças em `vite.config.ts` não devem ser validadas confiando apenas em HMR.

Resultado:
- sintomas antigos ainda apareciam
- foi necessário subir uma instância nova do Vite em outra porta para garantir que a configuração nova estava ativa

## Correções aplicadas

### 1. Injeção consistente de env no cliente
Arquivos:
- `vite.config.ts`
- `lib/settings.ts`

Foi criado um `__APP_ENV__` no build/dev server para expor ao frontend:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- demais variáveis já esperadas pelo cliente

Racional:
- resolver a causa estrutural
- evitar depender de duplicação manual no `.env`
- manter o contrato esperado pelo frontend

### 2. Compatibilidade de lookup para o webhook n8n
Arquivo:
- `backend/src/routes/campaigns.ts`

O backend passou a aceitar múltiplas chaves compatíveis:
- `n8n_webhook_url`
- `n8n_webhook_vapi`
- `webhook_url`

Racional:
- não quebrar dados já salvos
- alinhar frontend e backend sem exigir migração imediata

### 3. Ajuste da query de qualidade
Arquivo:
- `services/supabaseService.ts`

O filtro passou a usar valor textual coerente com o schema observado:
- `'false'`
- `'true'`

Racional:
- seguir o comportamento real dos dados
- eliminar o `400` que restava na área de qualidade

### 4. Remoção de ruídos menores
Arquivos:
- `index.html`
- `pages/Settings.tsx`

Ajustes:
- inclusão de favicon inline
- agrupamento correto dos campos de senha em `form`

Racional:
- limpar warnings que atrapalham a leitura do diagnóstico
- melhorar acabamento técnico da UI

## Estratégia de validação usada

### Etapa 1: provar se o erro era do código ou do ambiente
Antes de tratar o erro como bug real, o build foi repetido fora do sandbox.

### Etapa 2: validar com navegador real, não só com HTTP 200
Foi usado Chrome headless para navegar pelas rotas principais e coletar:
- `console.error`
- warnings
- exceptions
- dialogs
- falhas de rede relevantes

### Etapa 3: filtrar ruído de navegação
Durante a troca de rotas, alguns requests eram abortados naturalmente. Esses eventos não foram tratados como bug de produto.

### Etapa 4: validar em instância fresca
Como houve mudança em `vite.config.ts`, o frontend foi testado em uma nova porta, evitando confiar em estado antigo do Vite.

## Resultado final
Após as correções e o reteste headless:

- `/`: sem `console.error`
- `/#/contacts`: sem `console.error`
- `/#/calls`: sem `console.error`
- `/#/reports`: sem `console.error`
- `/#/quality`: sem `console.error`
- `/#/settings`: sem `console.error`
- `/#/logs`: sem `console.error`
- sem exceptions de runtime
- sem dialogs de erro
- sem falhas de rede relevantes de aplicação

## Pendência residual
Permanece o warning:
- uso de `cdn.tailwindcss.com` em produção

Isso não quebrou a aplicação, mas continua sendo um débito técnico. O ideal é migrar para uma pipeline local de Tailwind no build.

## Lições para o time

### 1. `200 OK` não valida SPA
HTML servindo corretamente não garante que a aplicação está funcional após o bootstrap do JavaScript.

### 2. Configuração do cliente precisa respeitar o modelo do Vite
Se a variável precisa existir no browser, ela deve ser exposta explicitamente.

### 3. HMR não substitui reinício quando a mudança é de configuração
Alterações em `vite.config.ts` devem ser revalidadas em instância nova.

### 4. Teste headless é bom para separar sintoma visual de erro real
Ele reduz adivinhação e acelera diagnóstico reproduzível.

### 5. Pequenas inconsistências de nomenclatura viram bugs caros
Especialmente em integrações entre frontend, backend e banco.
