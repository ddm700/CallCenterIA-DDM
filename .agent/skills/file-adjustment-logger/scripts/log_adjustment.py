#!/usr/bin/env python3
"""Append repository file-adjustment entries to logs/file-adjustments.log."""

from __future__ import annotations

import argparse
import difflib
import json
import os
import subprocess
from datetime import datetime
from pathlib import Path


def find_repo_root(start: Path) -> Path:
    current = start.resolve()
    for candidate in (current, *current.parents):
        if (candidate / ".git").exists() or (candidate / ".agent").exists():
            return candidate
    return current


def git_user(repo_root: Path) -> str | None:
    try:
        result = subprocess.run(
            ["git", "config", "user.name"],
            cwd=repo_root,
            check=False,
            capture_output=True,
            text=True,
        )
    except OSError:
        return None

    value = result.stdout.strip()
    return value or None


def run_git(repo_root: Path, args: list[str]) -> subprocess.CompletedProcess[str] | None:
    try:
        return subprocess.run(
            ["git", *args],
            cwd=repo_root,
            check=False,
            capture_output=True,
            text=True,
        )
    except OSError:
        return None


def normalize_paths(repo_root: Path, files: list[str]) -> list[str]:
    normalized: list[str] = []
    for raw in files:
        path = Path(raw)
        if path.is_absolute():
            try:
                normalized.append(path.resolve().relative_to(repo_root).as_posix())
                continue
            except ValueError:
                normalized.append(str(path))
                continue

        normalized.append(Path(raw).as_posix())

    return normalized


def is_git_tracked(repo_root: Path, file_path: str) -> bool:
    result = run_git(repo_root, ["ls-files", "--error-unmatch", "--", file_path])
    return bool(result and result.returncode == 0)


def git_diff(repo_root: Path, file_path: str) -> str:
    result = run_git(repo_root, ["diff", "--", file_path])
    if not result or result.returncode not in (0, 1):
        return ""
    return result.stdout


def added_file_patch(repo_root: Path, file_path: str) -> str:
    full_path = repo_root / file_path
    if not full_path.exists() or not full_path.is_file():
        return ""

    try:
        content = full_path.read_text(encoding="utf-8").splitlines()
    except UnicodeDecodeError:
        return f"Binary or non-UTF-8 file content not captured: {file_path}\n"

    return "\n".join(
        difflib.unified_diff(
            [],
            content,
            fromfile="/dev/null",
            tofile=file_path,
            lineterm="",
        )
    ) + "\n"


def deletion_patch(repo_root: Path, file_path: str) -> str:
    result = run_git(repo_root, ["diff", "--", file_path])
    if result and result.stdout:
        return result.stdout
    return f"Deleted file content not available from working tree: {file_path}\n"


def collect_adjustments(repo_root: Path, files: list[str]) -> list[dict[str, str]]:
    adjustments: list[dict[str, str]] = []

    for file_path in files:
        full_path = repo_root / file_path
        tracked = is_git_tracked(repo_root, file_path)
        patch = git_diff(repo_root, file_path) if tracked else ""

        if not patch and full_path.exists() and full_path.is_file():
            patch = added_file_patch(repo_root, file_path)
            status = "snapshot"
        elif patch:
            status = "diff"
        elif not full_path.exists():
            patch = deletion_patch(repo_root, file_path)
            status = "deleted"
        else:
            status = "not-captured"

        adjustments.append(
            {
                "file": file_path,
                "status": status,
                "patch": patch,
            }
        )

    return adjustments


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Append a file-adjustment log entry for this repository."
    )
    parser.add_argument(
        "--summary",
        required=True,
        help="Concise summary of the completed adjustment.",
    )
    parser.add_argument(
        "--files",
        nargs="+",
        required=True,
        help="Adjusted file paths, preferably relative to the repository root.",
    )
    parser.add_argument(
        "--actor",
        default=os.environ.get("AGENT_NAME") or os.environ.get("USERNAME") or "agent",
        help="Name of the person or agent responsible for the change.",
    )
    parser.add_argument(
        "--source",
        default="file-adjustment-logger",
        help="Source workflow or tool that emitted this entry.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repo_root = find_repo_root(Path.cwd())
    log_dir = repo_root / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)

    entry = {
        "timestamp": datetime.now().astimezone().isoformat(timespec="seconds"),
        "actor": args.actor,
        "git_user": git_user(repo_root),
        "source": args.source,
        "summary": args.summary,
        "files": normalize_paths(repo_root, args.files),
    }
    entry["adjustments"] = collect_adjustments(repo_root, entry["files"])

    log_path = log_dir / "file-adjustments.log"
    with log_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, ensure_ascii=False) + "\n")

    print(f"Logged adjustment to {log_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
