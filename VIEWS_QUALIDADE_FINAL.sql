-- ==============================================================================
-- VIEWS PARA ABA QUALIDADE - Versão Simplificada (sem dependência de campanha)
-- ==============================================================================

-- ============================================================================
-- 1. VIEW: Métricas de Qualidade (NPS e Ratings)
-- ============================================================================
CREATE OR REPLACE VIEW public.vw_quality_metrics AS
WITH rating_counts AS (
    SELECT
        COUNT(*) FILTER (WHERE structured_rating_label = 'Excelente') as excelente_count,
        COUNT(*) FILTER (WHERE structured_rating_label = 'Razoável') as razoavel_count,
        COUNT(*) FILTER (WHERE structured_rating_label = 'Ruim') as ruim_count,
        COUNT(*) FILTER (WHERE structured_rating_label = 'Boa') as boa_count,
        COUNT(*) FILTER (WHERE structured_rating_label IS NOT NULL) as total_rated
    FROM public.calls
    WHERE started_at IS NOT NULL
),
nps_calculation AS (
    SELECT
        -- Promotores (Excelente = 9-10)
        excelente_count as promoters,
        -- Detratores (Ruim = 0-6)
        ruim_count as detractors,
        -- Total avaliado
        total_rated,
        -- NPS = (% Promotores - % Detratores)
        CASE 
            WHEN total_rated > 0 THEN
                ROUND(((excelente_count::numeric / total_rated * 100) - 
                       (ruim_count::numeric / total_rated * 100)))
            ELSE 0
        END as nps_score,
        -- Rating médio (escala 0-10)
        CASE
            WHEN total_rated > 0 THEN
                ROUND(
                    (excelente_count * 10 + razoavel_count * 7 + boa_count * 5 + ruim_count * 2)::numeric / 
                    total_rated, 
                    1
                )
            ELSE 0
        END as avg_rating
    FROM rating_counts
)
SELECT
    nps_score,
    avg_rating,
    promoters,
    detractors,
    total_rated,
    ROUND((promoters::numeric / NULLIF(total_rated, 0)) * 100, 0) as promoters_percent,
    ROUND((detractors::numeric / NULLIF(total_rated, 0)) * 100, 0) as detractors_percent
FROM nps_calculation;

-- ============================================================================
-- 2. VIEW: Distribuição de Ratings
-- ============================================================================
CREATE OR REPLACE VIEW public.vw_quality_rating_distribution AS
WITH rating_counts AS (
    SELECT
        structured_rating_label,
        COUNT(*) as count,
        CASE structured_rating_label
            WHEN 'Excelente' THEN '#F97316'  -- Orange
            WHEN 'Razoável' THEN '#52525B'   -- Slate
            WHEN 'Boa' THEN '#FDF6E3'        -- Light
            WHEN 'Ruim' THEN '#FEF3C7'       -- Yellow light
            ELSE '#CBD5E1'
        END as color
    FROM public.calls
    WHERE structured_rating_label IS NOT NULL
    AND started_at IS NOT NULL
    GROUP BY structured_rating_label
),
total_count AS (
    SELECT SUM(count) as total FROM rating_counts
)
SELECT
    r.structured_rating_label as name,
    r.count as value,
    r.color,
    ROUND((r.count::numeric / NULLIF(t.total, 0)) * 100, 0) as percentage
FROM rating_counts r
CROSS JOIN total_count t
ORDER BY 
    CASE r.structured_rating_label
        WHEN 'Excelente' THEN 1
        WHEN 'Razoável' THEN 2
        WHEN 'Boa' THEN 3
        WHEN 'Ruim' THEN 4
        ELSE 5
    END;

-- ============================================================================
-- 3. VIEW: Score de Qualidade por Data (em vez de campanha)
-- ============================================================================
CREATE OR REPLACE VIEW public.vw_quality_by_campaign AS
WITH daily_ratings AS (
    SELECT
        TO_CHAR(started_at, 'DD/MM') as campaign_name,
        COUNT(*) as total_calls,
        -- Calcular score médio (0-100)
        ROUND(
            AVG(
                CASE structured_rating_label
                    WHEN 'Excelente' THEN 100
                    WHEN 'Razoável' THEN 70
                    WHEN 'Boa' THEN 50
                    WHEN 'Ruim' THEN 20
                    ELSE 0
                END
            ),
            0
        ) as score
    FROM public.calls
    WHERE started_at IS NOT NULL
    AND structured_rating_label IS NOT NULL
    AND started_at >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY TO_CHAR(started_at, 'DD/MM')
    HAVING COUNT(*) > 0
)
SELECT
    campaign_name as name,
    score,
    total_calls
FROM daily_ratings
ORDER BY score DESC
LIMIT 10;

-- ============================================================================
-- 4. VIEW: Top 10 Objeções/Emoções Mais Comuns
-- ============================================================================
CREATE OR REPLACE VIEW public.vw_quality_top_objections AS
WITH objections AS (
    SELECT
        -- Extrair objeções do structured_main_points ou análise
        TRIM(
            COALESCE(
                structured_main_points,
                structured_rating_text,
                'Sem objeção identificada'
            )
        ) as objection_text,
        COUNT(*) as occurrence_count
    FROM public.calls
    WHERE started_at IS NOT NULL
    AND (
        structured_main_points IS NOT NULL 
        OR structured_rating_text IS NOT NULL
    )
    -- Filtrar apenas chamadas com baixa qualidade
    AND structured_rating_label IN ('Ruim', 'Razoável')
    GROUP BY TRIM(
        COALESCE(
            structured_main_points,
            structured_rating_text,
            'Sem objeção identificada'
        )
    )
    HAVING COUNT(*) > 0
)
SELECT
    ROW_NUMBER() OVER (ORDER BY occurrence_count DESC) as rank,
    -- Limitar tamanho do texto para exibição
    CASE
        WHEN LENGTH(objection_text) > 100 THEN
            SUBSTRING(objection_text, 1, 97) || '...'
        ELSE
            objection_text
    END as objection,
    occurrence_count as occurrences
FROM objections
ORDER BY occurrence_count DESC
LIMIT 10;
