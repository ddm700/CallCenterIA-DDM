# Instruções para agentes neste repositório

## Log obrigatório de alterações de arquivos

Toda alteração de arquivo feita neste repositório (criar, editar, mover, apagar,
formatar ou gerar arquivos — incluindo documentação e lockfiles) **deve** ser
registrada em `logs/file-adjustments.log` logo depois que a alteração for
concluída com sucesso.

A definição completa da convenção está em
[`.agent/skills/file-adjustment-logger/SKILL.md`](.agent/skills/file-adjustment-logger/SKILL.md).
Resumo prático:

```bash
python .agent/skills/file-adjustment-logger/scripts/log_adjustment.py \
  --summary "<o que mudou, uma frase concisa>" \
  --files "<caminho/relativo/um>" "<caminho/relativo/dois>"
```

No Windows/PowerShell:

```powershell
python .agent\skills\file-adjustment-logger\scripts\log_adjustment.py --summary "Corrige X" --files "backend\src\arquivo.ts"
```

### Regras

- Rode o script **depois** que a alteração já tiver sido aplicada com sucesso,
  nunca antes.
- Use caminhos relativos à raiz deste projeto (a pasta que contém este
  `CLAUDE.md`), não caminhos absolutos.
- Se uma tarefa altera vários arquivos como um lote coerente, uma única
  chamada do script (listando todos os arquivos) é suficiente — não é preciso
  uma chamada por arquivo.
- O script já captura o `git diff` (arquivos rastreados) ou um snapshot do
  conteúdo (arquivos novos) automaticamente — não é necessário informar o
  patch manualmente.
- Se o script falhar, avise o usuário explicitamente em vez de seguir em
  frente sem registrar.
- Não edite `logs/file-adjustments.log` manualmente, exceto para recuperar uma
  entrada quebrada ou fazer backfill de um gap identificado (e nesse caso,
  marque a entrada com `"backfilled": true` e o motivo).

### Por que isso existe

Este repositório é trabalhado por múltiplas ferramentas de agente de IA (Claude
Code, e outros agentes que leem `.agent/`). `logs/file-adjustments.log` é o
único histórico comum entre elas — é a partir dele que relatórios de
acompanhamento de mudanças (ex.: `relatorio.md`) são gerados. Uma alteração que
não é registrada ali some do radar desses relatórios, mesmo que tenha sido
commitada no git.
