#!/usr/bin/env python3
"""Install this folder as a personal Claude Code Agent Skill."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile


SKILL_NAME = "synology-nas-access"


def ignore(_directory: str, names: list[str]) -> set[str]:
    ignored = {name for name in names if name in {".git", "__pycache__", ".DS_Store", "tests"}}
    ignored.update(name for name in names if name.endswith((".pyc", ".zip")))
    if ".env" in names:
        ignored.add(".env")
    if "state" in names:
        ignored.add("state")
    return ignored


def main() -> int:
    parser = argparse.ArgumentParser(description="Install synology-nas-access for Claude Code")
    parser.add_argument("--update", action="store_true", help="Replace an existing installed copy")
    args = parser.parse_args()

    source = Path(__file__).resolve().parent
    if not (source / "SKILL.md").is_file():
        parser.error("Run this script from the complete extracted skill package")
    config_root = Path(os.environ.get("CLAUDE_CONFIG_DIR", Path.home() / ".claude")).expanduser()
    destination = config_root / "skills" / SKILL_NAME
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() and not args.update:
        parser.error(f"{destination} already exists; use --update only after reviewing the new package")

    with tempfile.TemporaryDirectory(prefix="skill-install-", dir=str(destination.parent)) as temp_dir:
        staged = Path(temp_dir) / SKILL_NAME
        shutil.copytree(source, staged, ignore=ignore)
        if destination.exists():
            backup = destination.with_name(destination.name + ".previous")
            if backup.exists():
                parser.error(f"Refusing to replace existing backup: {backup}")
            destination.rename(backup)
        staged.rename(destination)

    json.dump(
        {
            "ok": True,
            "installed": str(destination),
            "next": f"python3 {destination / 'scripts' / 'configure.py'} init",
        },
        sys.stdout,
        ensure_ascii=False,
        indent=2,
    )
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
