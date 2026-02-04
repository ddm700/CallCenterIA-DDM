-- ============================================
-- MIGRATION: CPF Obrigatório e Relação CPF ↔ Telefone
-- Data: 2026-02-04
-- Descrição: Torna CPF obrigatório e cria constraint única para CPF+Telefone
-- ============================================

-- PASSO 1: Atualizar registros com CPF vazio/null
-- (Preencher com valor temporário para não quebrar a constraint NOT NULL)
UPDATE contacts 
SET cpf = 'PENDENTE_' || id::text 
WHERE cpf IS NULL OR cpf = '';

-- PASSO 2: Tornar coluna CPF obrigatória (NOT NULL)
ALTER TABLE contacts 
ALTER COLUMN cpf SET NOT NULL;

-- PASSO 3: Criar índice único para a combinação CPF + Telefone
-- Isso garante que um CPF só pode estar associado a um telefone específico
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_cpf_telefone 
ON contacts (cpf, telefone);

-- PASSO 4: Adicionar comentário para documentação
COMMENT ON COLUMN contacts.cpf IS 'CPF do contato - Obrigatório. Relação única com telefone.';

-- PASSO 5: Verificar dados após migração
SELECT 
  COUNT(*) as total_contatos,
  COUNT(DISTINCT cpf) as cpfs_unicos,
  COUNT(DISTINCT telefone) as telefones_unicos,
  COUNT(DISTINCT (cpf, telefone)) as combinacoes_unicas
FROM contacts;

-- ============================================
-- ROLLBACK (caso necessário)
-- ============================================
-- ALTER TABLE contacts ALTER COLUMN cpf DROP NOT NULL;
-- DROP INDEX IF EXISTS idx_contacts_cpf_telefone;
