# 🔐 Mudança de Regra de Negócio: CPF Obrigatório

**Data:** 2026-02-04  
**Autor:** Sistema  
**Status:** ✅ Implementado (Aguardando execução do SQL)

---

## 📋 Resumo das Mudanças

### Antes ❌
- CPF era **opcional**
- Não havia validação de formato
- Não havia relação única entre CPF e Telefone
- Permitia CPF vazio ou duplicado

### Depois ✅
- CPF é **obrigatório**
- Validação de formato (11 dígitos)
- **Relação única CPF ↔ Telefone** (constraint no banco)
- Mensagens de erro específicas para duplicidade

---

## 🗄️ Alterações no Banco de Dados

### 1. SQL a Executar

Execute o arquivo `MIGRATION_CPF_OBRIGATORIO.sql` no SQL Editor do Supabase.

**O que ele faz:**
1. Preenche CPFs vazios com valor temporário `PENDENTE_{id}`
2. Torna a coluna `cpf` obrigatória (NOT NULL)
3. Cria índice único para `(cpf, telefone)`
4. Adiciona documentação na coluna

### 2. Constraint Criada

```sql
CREATE UNIQUE INDEX idx_contacts_cpf_telefone 
ON contacts (cpf, telefone);
```

**Significado:**  
Um CPF só pode estar associado a **um único telefone**. Se você tentar cadastrar o mesmo CPF com o mesmo telefone novamente, o banco retornará erro.

---

## 💻 Alterações no Frontend

### 1. Validação no Modal "Novo Contato"

**Arquivo:** `pages/Contacts.tsx` (linhas 112-150)

```typescript
// Validação de CPF obrigatório
if (!createForm.cpf || createForm.cpf.trim() === '') {
  return alert('CPF é obrigatório.');
}

// Validação de formato (11 dígitos)
const cpfDigits = createForm.cpf.replace(/\D/g, '');
if (cpfDigits.length !== 11) {
  return alert('CPF inválido. Deve conter 11 dígitos.');
}
```

### 2. Validação na Importação de Planilhas

**Arquivo:** `pages/Contacts.tsx` (linhas 191-265)

```typescript
// Filtra apenas contatos com CPF válido (11 dígitos)
const hasCpf = r.cpf && r.cpf.replace(/\D/g, '').length === 11;
return hasPhone && hasCpf;
```

### 3. Tratamento de Erros de Duplicidade

```typescript
if (e.message?.includes('duplicate') || e.message?.includes('idx_contacts_cpf_telefone')) {
  alert('Erro: Este CPF já está associado a este número de telefone.');
}
```

### 4. Interface Atualizada

- Label alterado de "CPF (Opcional)" para **"CPF *"**
- Placeholder adicionado: `"000.000.000-00 ou 00000000000"`
- Atributo `required` adicionado ao input
- Mensagem de importação atualizada para "Colunas obrigatórias: nome, telefone, cpf"

---

## 🧪 Cenários de Teste

### ✅ Casos Válidos

| Cenário | CPF | Telefone | Resultado |
|---------|-----|----------|-----------|
| Novo contato | 12345678901 | 31999999999 | ✅ Criado |
| Mesmo CPF, telefone diferente | 12345678901 | 31988888888 | ✅ Criado |
| CPF diferente, mesmo telefone | 98765432100 | 31999999999 | ✅ Criado |

### ❌ Casos Inválidos

| Cenário | CPF | Telefone | Erro Esperado |
|---------|-----|----------|---------------|
| CPF vazio | "" | 31999999999 | "CPF é obrigatório." |
| CPF com 10 dígitos | 1234567890 | 31999999999 | "CPF inválido. Deve conter 11 dígitos." |
| CPF duplicado + mesmo telefone | 12345678901 | 31999999999 | "Este CPF já está associado a este número de telefone." |

---

## 🔄 Impacto em Outros Arquivos

### `services/supabaseService.ts`

**Função:** `importContacts()` (linha 203)

Esta função já normaliza o CPF:
```typescript
cpf: c.cpf.replace(/\D/g, '')  // Remove caracteres não numéricos
```

✅ **Não precisa de alteração** - já está preparada para receber CPF obrigatório.

---

## 📊 Dados Existentes

### Verificação Pós-Migração

Após executar o SQL, rode esta query para verificar:

```sql
SELECT 
  COUNT(*) as total_contatos,
  COUNT(DISTINCT cpf) as cpfs_unicos,
  COUNT(DISTINCT telefone) as telefones_unicos,
  COUNT(DISTINCT (cpf, telefone)) as combinacoes_unicas
FROM contacts;
```

### Contatos com CPF Temporário

Se houver contatos com CPF vazio, eles receberão `PENDENTE_{id}`. Para identificá-los:

```sql
SELECT id, nome, cpf, telefone 
FROM contacts 
WHERE cpf LIKE 'PENDENTE_%';
```

**Ação recomendada:** Atualizar manualmente esses registros com CPF real.

---

## 🚨 Rollback (Se Necessário)

Se precisar reverter as mudanças no banco:

```sql
-- Remover constraint NOT NULL
ALTER TABLE contacts ALTER COLUMN cpf DROP NOT NULL;

-- Remover índice único
DROP INDEX IF EXISTS idx_contacts_cpf_telefone;
```

⚠️ **Atenção:** Isso não reverterá os CPFs temporários criados.

---

## ✅ Checklist de Implementação

- [x] Criar arquivo SQL de migração
- [x] Atualizar validação no modal de criação
- [x] Atualizar validação na importação
- [x] Adicionar tratamento de erros de duplicidade
- [x] Atualizar interface (labels, placeholders)
- [ ] **Executar SQL no Supabase** ← **VOCÊ PRECISA FAZER ISSO**
- [ ] Testar criação de contato manual
- [ ] Testar importação de planilha
- [ ] Testar cenários de erro (CPF vazio, duplicado)

---

## 📞 Próximos Passos

1. **Execute o SQL:** Abra o SQL Editor do Supabase e execute `MIGRATION_CPF_OBRIGATORIO.sql`
2. **Teste a aplicação:** Tente criar um contato sem CPF (deve dar erro)
3. **Verifique duplicidade:** Tente criar o mesmo CPF+Telefone duas vezes
4. **Importe planilha:** Teste com arquivo Excel contendo CPFs válidos e inválidos

---

**Dúvidas?** Consulte este documento ou verifique os logs do console para mensagens de erro detalhadas.
