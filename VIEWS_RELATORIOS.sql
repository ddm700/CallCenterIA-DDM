-- ==============================================================================
-- VIEWS PARA RELATÓRIOS - Dados Reais Agregados
-- ==============================================================================

-- ============================================================================
-- 1. VIEW: Métricas Gerais (KPIs)
-- ============================================================================
CREATE OR REPLACE VIEW public.vw_report_kpis AS
SELECT
    -- Total de chamadas
    COUNT(*) as total_calls,
    
    -- Taxa de contato (chamadas que duraram mais de 5 segundos)
    COUNT(*) FILTER (WHERE duration_seconds > 5) as contacted_calls,
    ROUND(
        (COUNT(*) FILTER (WHERE duration_seconds > 5)::numeric / NULLIF(COUNT(*), 0)) * 100, 
        1
    ) as contact_rate_percent,
    
    -- Taxa de sucesso (baseado em success_evaluation ou structured_rating_label)
    COUNT(*) FILTER (
        WHERE success_evaluation = 'true' 
        OR structured_rating_label IN ('Sucesso', 'Razoável')
    ) as successful_calls,
    ROUND(
        (COUNT(*) FILTER (
            WHERE success_evaluation = 'true' 
            OR structured_rating_label IN ('Sucesso', 'Razoável')
        )::numeric / NULLIF(COUNT(*) FILTER (WHERE duration_seconds > 5), 0)) * 100,
        1
    ) as success_rate_percent,
    
    -- Duração média (em segundos)
    ROUND(AVG(duration_seconds)) as avg_duration_seconds,
    
    -- Custo total
    COALESCE(SUM(custo_total), 0) as total_cost,
    
    -- Período de análise
    MIN(started_at) as period_start,
    MAX(started_at) as period_end
FROM public.calls
WHERE started_at IS NOT NULL;

-- ============================================================================
-- 2. VIEW: Funil de Conversão
-- ============================================================================
CREATE OR REPLACE VIEW public.vw_report_funnel AS
WITH funnel_stages AS (
    SELECT
        'Total' as stage,
        1 as stage_order,
        COUNT(*) as value
    FROM public.calls
    WHERE started_at IS NOT NULL
    
    UNION ALL
    
    SELECT
        'Conectadas' as stage,
        2 as stage_order,
        COUNT(*) as value
    FROM public.calls
    WHERE started_at IS NOT NULL
    AND duration_seconds > 5
    
    UNION ALL
    
    SELECT
        'Bem-Sucedidas' as stage,
        3 as stage_order,
        COUNT(*) as value
    FROM public.calls
    WHERE started_at IS NOT NULL
    AND (
        success_evaluation = 'true' 
        OR structured_rating_label IN ('Sucesso', 'Razoável')
    )
    
    UNION ALL
    
    SELECT
        'Com Promessa' as stage,
        4 as stage_order,
        COUNT(*) as value
    FROM public.calls
    WHERE started_at IS NOT NULL
    AND (
        -- Aqui você pode adicionar lógica específica para "promessa"
        -- Por exemplo, se houver um campo específico ou palavra-chave no transcript
        structured_rating_label = 'Sucesso'
        OR transcript ILIKE '%promessa%'
        OR transcript ILIKE '%acordo%'
    )
)
SELECT 
    stage as name,
    value
FROM funnel_stages
ORDER BY stage_order;

-- ============================================================================
-- 3. VIEW: Motivos de Término
-- ============================================================================
CREATE OR REPLACE VIEW public.vw_report_termination_reasons AS
WITH termination_mapping AS (
    SELECT
        CASE
            WHEN ended_reason ILIKE '%customer%' THEN 'Cliente Desligou'
            WHEN ended_reason ILIKE '%timeout%' OR ended_reason ILIKE '%timed%' THEN 'Timed Out'
            WHEN ended_reason ILIKE '%assistant%' THEN 'Assistente Finalizou'
            WHEN ended_reason ILIKE '%transport%' OR ended_reason ILIKE '%error%' THEN 'Erro Transp.'
            ELSE 'Outros'
        END as reason_category,
        CASE
            WHEN ended_reason ILIKE '%customer%' THEN '#F97316' -- Orange
            WHEN ended_reason ILIKE '%timeout%' OR ended_reason ILIKE '%timed%' THEN '#FCD34D' -- Yellow
            WHEN ended_reason ILIKE '%assistant%' THEN '#64748B' -- Slate
            WHEN ended_reason ILIKE '%transport%' OR ended_reason ILIKE '%error%' THEN '#94A3B8' -- Light Slate
            ELSE '#CBD5E1' -- Very Light Slate
        END as color
    FROM public.calls
    WHERE ended_reason IS NOT NULL
    AND started_at IS NOT NULL
)
SELECT
    reason_category as name,
    COUNT(*) as value,
    MAX(color) as color
FROM termination_mapping
GROUP BY reason_category
ORDER BY value DESC;

-- ============================================================================
-- 4. VIEW: Atividade por Dia (Últimos 30 Dias)
-- ============================================================================
CREATE OR REPLACE VIEW public.vw_report_daily_activity AS
WITH last_30_days AS (
    SELECT generate_series(
        CURRENT_DATE - INTERVAL '29 days',
        CURRENT_DATE,
        '1 day'::interval
    )::date as day
),
daily_stats AS (
    SELECT
        DATE(started_at) as call_date,
        COUNT(*) as call_count
    FROM public.calls
    WHERE started_at >= CURRENT_DATE - INTERVAL '29 days'
    AND started_at IS NOT NULL
    GROUP BY DATE(started_at)
)
SELECT
    TO_CHAR(l.day, 'DD') as day,
    COALESCE(d.call_count, 0) as count
FROM last_30_days l
LEFT JOIN daily_stats d ON l.day = d.call_date
ORDER BY l.day;

-- ============================================================================
-- 5. VIEW: Evolução de Custos por Dia (Últimos 30 Dias)
-- ============================================================================
CREATE OR REPLACE VIEW public.vw_report_daily_costs AS
WITH last_30_days AS (
    SELECT generate_series(
        CURRENT_DATE - INTERVAL '29 days',
        CURRENT_DATE,
        '1 day'::interval
    )::date as day
),
daily_costs AS (
    SELECT
        DATE(started_at) as call_date,
        COALESCE(SUM(custo_total), 0) as total_cost
    FROM public.calls
    WHERE started_at >= CURRENT_DATE - INTERVAL '29 days'
    AND started_at IS NOT NULL
    GROUP BY DATE(started_at)
)
SELECT
    TO_CHAR(l.day, 'DD') as day,
    ROUND(COALESCE(d.total_cost, 0)::numeric, 2) as cost
FROM last_30_days l
LEFT JOIN daily_costs d ON l.day = d.call_date
ORDER BY l.day;

-- ============================================================================
-- COMENTÁRIOS E DOCUMENTAÇÃO
-- ============================================================================

COMMENT ON VIEW public.vw_report_kpis IS 
'Métricas agregadas (KPIs) para o dashboard de relatórios. 
Calcula taxa de contato, taxa de sucesso, duração média e custo total.';

COMMENT ON VIEW public.vw_report_funnel IS 
'Dados do funil de conversão mostrando Total → Conectadas → Bem-Sucedidas → Com Promessa.';

COMMENT ON VIEW public.vw_report_termination_reasons IS 
'Distribuição dos motivos de término das chamadas com cores para visualização.';

COMMENT ON VIEW public.vw_report_daily_activity IS 
'Contagem de chamadas por dia nos últimos 30 dias.';

COMMENT ON VIEW public.vw_report_daily_costs IS 
'Evolução dos custos diários nos últimos 30 dias.';

-- ============================================================================
-- TESTES DAS VIEWS
-- ============================================================================

-- Testar KPIs
SELECT * FROM public.vw_report_kpis;

-- Testar Funil
SELECT * FROM public.vw_report_funnel;

-- Testar Motivos de Término
SELECT * FROM public.vw_report_termination_reasons;

-- Testar Atividade Diária
SELECT * FROM public.vw_report_daily_activity;

-- Testar Custos Diários
SELECT * FROM public.vw_report_daily_costs;
