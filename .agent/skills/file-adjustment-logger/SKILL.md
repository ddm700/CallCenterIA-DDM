---
name: file-adjustment-logger
description: Logs every repository file adjustment after creating, editing, moving, deleting, formatting, or generating files, including the patch/content for the adjusted files. Use after any tool or command changes files in this repository so the adjustment is recorded under the workspace logs directory.
allowed-tools: Read, Bash
---

# File Adjustment Logger

Run this skill after every completed file change in this repository.

## Required Log Step

1. Identify the adjusted file paths relative to the repository root.
2. Summarize what changed in one concise sentence.
3. Run:

```bash
python .agent/skills/file-adjustment-logger/scripts/log_adjustment.py --summary "<what changed>" --files "<relative/path/one>" "<relative/path/two>"
```

Use PowerShell quoting when needed:

```powershell
python .agent\skills\file-adjustment-logger\scripts\log_adjustment.py --summary "Updated validation flow" --files "src\example.ts"
```

## Rules

- Log file creations, edits, moves, deletes, generated files, formatting-only changes, dependency lockfile updates, and documentation changes.
- Include the content of the adjustment in the log entry. The script captures `git diff` for tracked files and a new-file snapshot patch for untracked files.
- Log the adjustment after the file operation succeeds, not before.
- Use repository-relative paths. Do not use absolute paths unless the file is outside the repository.
- If a single task changes files in batches, write one log entry per coherent batch.
- If the logging script fails, report the failure and do not silently skip the log.
- Do not edit `logs/file-adjustments.log` manually except to recover from a broken entry.
- Do not create a secondary log entry for changes made only by this logging script to `logs/file-adjustments.log`.

## Log Destination

The script appends JSON Lines entries to:

```text
logs/file-adjustments.log
```

Each JSONL entry includes an `adjustments` array with one object per file and a `patch` field containing the captured diff or snapshot.
