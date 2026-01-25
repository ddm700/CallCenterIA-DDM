# 📊 Arquivos SQL de Produção

Este diretório contém os arquivos SQL essenciais para o funcionamento da aplicação.

## 🎯 Arquivos de Produção

### 1. `VIEWS_RELATORIOS.sql`
**Propósito:** Views para a aba "Relatórios"

**Views criadas:**
- `vw_report_kpis` - Métricas gerais (total de chamadas, taxa de contato, taxa de sucesso)
- `vw_report_funnel` - Funil de conversão
- `vw_report_termination_reasons` - Motivos de término
- `vw_report_daily_activity` - Atividade por dia (últimos 30 dias)
- `vw_report_daily_costs` - Evolução de custos

**Como executar:**
```bash
# No SQL Editor do Supabase
# Execute o arquivo completo
```

---

### 2. `VIEWS_QUALIDADE_FINAL.sql`
**Propósito:** Views para a aba "Qualidade"

**Views criadas:**
- `vw_quality_metrics` - NPS, rating médio, promotores, detratores
- `vw_quality_rating_distribution` - Distribuição de ratings (Excelente, Razoável, Boa, Ruim)
- `vw_quality_by_campaign` - Score de qualidade por data (0-100)
- `vw_quality_top_objections` - Top 10 objeções mais comuns

**Como executar:**
```bash
# No SQL Editor do Supabase
# Execute o arquivo completo
```

---

### 3. `MAPEAMENTO_STATUS_LIGACOES.sql`
**Propósito:** Função para mapear status técnico da VAPI para status amigável

**Componentes:**
- `get_call_friendly_status()` - Função que mapeia status
- `vw_calls_history` - View com histórico de ligações e status amigável

**Mapeamento de Status:**
| ended_reason | status_tecnico | status_amigavel | Cor |
|--------------|----------------|-----------------|-----|
| customer-ended-call | completed | concluida | Verde |
| max-duration-exceeded | completed | interrompida | Amarelo |
| transport-error | failed | erro_tecnico | Vermelho |
| no-answer | failed | nao_atendeu | Cinza |

**Como executar:**
```bash
# No SQL Editor do Supabase
# Execute o arquivo completo
```

---

## 📁 Estrutura de Pastas

```
CallCenterIA-DDM/
├── VIEWS_RELATORIOS.sql          # Views de relatórios
├── VIEWS_QUALIDADE_FINAL.sql     # Views de qualidade
├── MAPEAMENTO_STATUS_LIGACOES.sql # Função de status
├── .archive/                      # Arquivos de debug/documentação
│   ├── *.sql                      # SQLs de teste/correção
│   └── *.md                       # Documentação de desenvolvimento
└── README_SQL.md                  # Este arquivo
```

---

## 🚀 Ordem de Execução (Setup Inicial)

1. **Primeiro:** `VIEWS_RELATORIOS.sql`
2. **Segundo:** `VIEWS_QUALIDADE_FINAL.sql`
3. **Terceiro:** `MAPEAMENTO_STATUS_LIGACOES.sql`

---

## 🔧 Manutenção

### Atualizar Views
```sql
-- Recriar uma view específica
DROP VIEW IF EXISTS vw_report_kpis CASCADE;
-- Depois execute a seção correspondente do arquivo SQL
```

### Verificar Views Existentes
```sql
SELECT table_name 
FROM information_schema.views 
WHERE table_schema = 'public' 
AND table_name LIKE 'vw_%';
```

### Verificar Funções
```sql
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_type = 'FUNCTION';
```

---

## 📊 Integração com Frontend

### Relatórios (`pages/Reports.tsx`)
```typescript
// Usa as views vw_report_*
const kpis = await supabaseService.getReportKPIs();
const funnel = await supabaseService.getReportFunnel();
```

### Qualidade (`pages/Quality.tsx`)
```typescript
// Usa as views vw_quality_*
const metrics = await supabaseService.getQualityMetrics();
const distribution = await supabaseService.getQualityRatingDistribution();
```

### Ligações (`pages/Calls.tsx`)
```typescript
// Usa vw_calls_history
const history = await supabaseService.getCallsHistory();
```

---

## 🎯 Princípios Aplicados

### Backend Specialist
- ✅ **Database-level aggregation** - Cálculos no PostgreSQL
- ✅ **Views for complex metrics** - Lógica de negócio no banco
- ✅ **Performance optimization** - Agregação eficiente
- ✅ **Clear business logic** - Funções com nomes descritivos

### Clean Code
- ✅ **Self-documenting** - Nomes claros de views e colunas
- ✅ **Single responsibility** - Cada view tem um propósito
- ✅ **DRY** - Funções reutilizáveis (get_call_friendly_status)

---

## 📝 Notas

- Todos os arquivos em `.archive/` são de desenvolvimento/debug
- Não delete `.archive/` - contém histórico de correções
- Para adicionar novas views, crie em um arquivo separado primeiro
- Teste em ambiente de dev antes de aplicar em produção

---

**Última atualização:** 2026-01-24
**Versão:** 1.0.0
