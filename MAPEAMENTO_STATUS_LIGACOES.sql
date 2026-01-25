-- ==============================================================================
-- MAPEAMENTO INTELIGENTE DE STATUS DE LIGAÇÕES
-- ==============================================================================
-- Problema: Ligação interrompida pelo cliente aparece como "falhou"
-- Solução: Criar status mais precisos baseados em ended_reason
-- ==============================================================================

-- ============================================================================
-- 1. Adicionar coluna computed para status amigável
-- ============================================================================

-- Criar função para mapear status
CREATE OR REPLACE FUNCTION get_call_friendly_status(
    p_status TEXT,
    p_ended_reason TEXT,
    p_duration_seconds INT
) RETURNS TEXT AS $$
BEGIN
    -- Se não terminou ainda
    IF p_status IS NULL OR p_status = 'in-progress' THEN
        RETURN 'em_andamento';
    END IF;
    
    -- Se completou com sucesso
    IF p_status = 'completed' THEN
        -- Verificar motivo do término
        RETURN CASE
            -- Cliente desligou (normal)
            WHEN p_ended_reason ILIKE '%customer%' OR p_ended_reason ILIKE '%hang%' THEN 'concluida'
            
            -- Assistente finalizou (sucesso)
            WHEN p_ended_reason ILIKE '%assistant%' OR p_ended_reason ILIKE '%completed%' THEN 'concluida'
            
            -- Timeout (ligação longa, mas interrompida)
            WHEN p_ended_reason ILIKE '%timeout%' OR p_ended_reason ILIKE '%max%duration%' THEN 'interrompida'
            
            -- Caso contrário, concluída
            ELSE 'concluida'
        END;
    END IF;
    
    -- Se falhou
    IF p_status = 'failed' THEN
        RETURN CASE
            -- Erro de transporte (problema técnico)
            WHEN p_ended_reason ILIKE '%transport%' OR p_ended_reason ILIKE '%error%' THEN 'erro_tecnico'
            
            -- Não atendeu
            WHEN p_ended_reason ILIKE '%no%answer%' OR p_ended_reason ILIKE '%busy%' THEN 'nao_atendeu'
            
            -- Caso contrário, falha
            ELSE 'falhou'
        END;
    END IF;
    
    -- Padrão
    RETURN 'desconhecido';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION get_call_friendly_status IS 
'Mapeia status técnico da VAPI para status amigável ao usuário.';

-- ============================================================================
-- 2. Criar VIEW para histórico de ligações com status amigável
-- ============================================================================

CREATE OR REPLACE VIEW vw_calls_history AS
SELECT
    c.id,
    c.started_at,
    c.ended_at,
    c.duration_seconds,
    c.customer_number,
    c.status as status_tecnico,
    c.ended_reason,
    
    -- Status amigável
    get_call_friendly_status(c.status, c.ended_reason, c.duration_seconds) as status_amigavel,
    
    -- Descrição do status
    CASE get_call_friendly_status(c.status, c.ended_reason, c.duration_seconds)
        WHEN 'concluida' THEN 'Ligação concluída'
        WHEN 'interrompida' THEN 'Interrompida (timeout)'
        WHEN 'erro_tecnico' THEN 'Erro técnico'
        WHEN 'nao_atendeu' THEN 'Não atendeu'
        WHEN 'falhou' THEN 'Falhou'
        WHEN 'em_andamento' THEN 'Em andamento'
        ELSE 'Desconhecido'
    END as status_descricao,
    
    -- Badge color
    CASE get_call_friendly_status(c.status, c.ended_reason, c.duration_seconds)
        WHEN 'concluida' THEN 'success'
        WHEN 'interrompida' THEN 'warning'
        WHEN 'erro_tecnico' THEN 'danger'
        WHEN 'nao_atendeu' THEN 'neutral'
        WHEN 'falhou' THEN 'danger'
        WHEN 'em_andamento' THEN 'primary'
        ELSE 'neutral'
    END as badge_variant,
    
    -- Outros campos
    c.success_evaluation,
    c.structured_rating_label,
    c.custo_total,
    camp.nome as campaign_name,
    cont.nome as contact_name
FROM calls c
LEFT JOIN campaign_contacts cc ON c.customer_number = (
    SELECT telefone FROM contacts WHERE id = cc.contact_id LIMIT 1
)
LEFT JOIN campaigns camp ON cc.campaign_id = camp.id
LEFT JOIN contacts cont ON cc.contact_id = cont.id
WHERE c.started_at IS NOT NULL
ORDER BY c.started_at DESC;

COMMENT ON VIEW vw_calls_history IS 
'Histórico de ligações com status amigável mapeado de ended_reason.';

-- ============================================================================
-- 3. Exemplos de mapeamento
-- ============================================================================

/*
MAPEAMENTO DE STATUS:

ended_reason                          | status_tecnico | status_amigavel | status_descricao
--------------------------------------|----------------|-----------------|------------------
"customer-ended-call"                 | completed      | concluida       | Ligação concluída
"assistant-ended-call"                | completed      | concluida       | Ligação concluída
"max-duration-exceeded"               | completed      | interrompida    | Interrompida (timeout)
"transport-error"                     | failed         | erro_tecnico    | Erro técnico
"no-answer"                           | failed         | nao_atendeu     | Não atendeu
"busy"                                | failed         | nao_atendeu     | Não atendeu

CORES DO BADGE:
- concluida → Verde (success)
- interrompida → Amarelo (warning) ← NOVO!
- erro_tecnico → Vermelho (danger)
- nao_atendeu → Cinza (neutral)
- falhou → Vermelho (danger)
*/

-- ============================================================================
-- 4. Testar a função
-- ============================================================================

-- Ver mapeamento de status das ligações existentes
SELECT
    id,
    status as status_original,
    ended_reason,
    get_call_friendly_status(status, ended_reason, duration_seconds) as status_amigavel,
    duration_seconds
FROM calls
WHERE ended_at IS NOT NULL
ORDER BY started_at DESC
LIMIT 10;

-- Ver distribuição de status
SELECT
    get_call_friendly_status(status, ended_reason, duration_seconds) as status_amigavel,
    COUNT(*) as total,
    ROUND(AVG(duration_seconds)) as duracao_media
FROM calls
WHERE ended_at IS NOT NULL
GROUP BY get_call_friendly_status(status, ended_reason, duration_seconds)
ORDER BY total DESC;
