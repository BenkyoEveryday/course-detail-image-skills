#!/usr/bin/env python3
"""Generate or verify SHA-256 checksums for all files shipped inside skills."""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SKILLS_ROOT = ROOT / "plugins" / "course-detail-image-generator" / "skills"
CHECKSUM_FILE = ROOT / "SKILL-CHECKSUMS.sha256"


def skill_files() -> list[Path]:
    return sorted(
        path
        for path in SKILLS_ROOT.rglob("*")
        if path.is_file() and not any(part.startswith(".") for part in path.parts)
    )


def rendered_checksums() -> str:
    lines = []
    for path in skill_files():
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        lines.append(f"{digest}  {path.relative_to(ROOT).as_posix()}")
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="Fail if SKILL-CHECKSUMS.sha256 is not current.",
    )
    args = parser.parse_args()

    expected = rendered_checksums()
    if args.check:
        actual = CHECKSUM_FILE.read_text(encoding="utf-8") if CHECKSUM_FILE.exists() else ""
        if actual != expected:
            print("ERROR: SKILL-CHECKSUMS.sha256 is stale.")
            print("Run: python3 scripts/update_checksums.py")
            return 1
        print(f"OK: {len(skill_files())} skill files match the checksum manifest.")
        return 0

    CHECKSUM_FILE.write_text(expected, encoding="utf-8")
    print(f"Updated {CHECKSUM_FILE.relative_to(ROOT)} with {len(skill_files())} files.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
