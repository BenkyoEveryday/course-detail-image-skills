#!/usr/bin/env python3
"""Validate marketplace, plugin, skills, scripts, and integrity metadata."""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MARKETPLACE = ROOT / ".agents" / "plugins" / "marketplace.json"
PLUGIN_ROOT = ROOT / "plugins" / "course-detail-image-generator"
PLUGIN_MANIFEST = PLUGIN_ROOT / ".codex-plugin" / "plugin.json"
SKILLS_ROOT = PLUGIN_ROOT / "skills"
REQUIRED_ROOT_FILES = (
    "README.md",
    "CHANGELOG.md",
    "CONTRIBUTING.md",
    "LICENSE",
    "SECURITY.md",
    "SKILL-CHECKSUMS.sha256",
)
SKILL_NAME = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
SEMVER = re.compile(r"^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$")
FORBIDDEN_SKILL_DOCS = {
    "README.md",
    "CHANGELOG.md",
    "CONTRIBUTING.md",
    "INSTALLATION_GUIDE.md",
    "QUICK_REFERENCE.md",
}


class Validation:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.notes: list[str] = []

    def require(self, condition: bool, message: str) -> None:
        if not condition:
            self.errors.append(message)

    def note(self, message: str) -> None:
        self.notes.append(message)


def load_json(path: Path, validation: Validation) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        validation.errors.append(f"{path.relative_to(ROOT)}: invalid JSON: {exc}")
        return {}


def parse_frontmatter(path: Path, validation: Validation) -> tuple[dict[str, str], str]:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        validation.errors.append(f"{path.relative_to(ROOT)}: cannot read: {exc}")
        return {}, ""

    lines = text.splitlines()
    if not lines or lines[0] != "---":
        validation.errors.append(f"{path.relative_to(ROOT)}: missing opening frontmatter marker")
        return {}, text

    try:
        end = lines.index("---", 1)
    except ValueError:
        validation.errors.append(f"{path.relative_to(ROOT)}: missing closing frontmatter marker")
        return {}, text

    metadata: dict[str, str] = {}
    for number, line in enumerate(lines[1:end], start=2):
        if not line.strip():
            continue
        if ":" not in line:
            validation.errors.append(
                f"{path.relative_to(ROOT)}:{number}: frontmatter must use key: value"
            )
            continue
        key, value = line.split(":", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        metadata[key] = value
    return metadata, "\n".join(lines[end + 1 :])


def quoted_yaml_value(text: str, key: str) -> str | None:
    match = re.search(rf"^\s+{re.escape(key)}:\s+([\"'])(.*?)\1\s*$", text, re.MULTILINE)
    return match.group(2) if match else None


def validate_marketplace(validation: Validation) -> None:
    data = load_json(MARKETPLACE, validation)
    validation.require(data.get("name") == "course-detail-team", "marketplace name must be course-detail-team")
    plugins = data.get("plugins", [])
    validation.require(isinstance(plugins, list) and len(plugins) > 0, "marketplace must list at least one plugin")
    for plugin in plugins if isinstance(plugins, list) else []:
        source = plugin.get("source", {})
        path = source.get("path")
        validation.require(source.get("source") == "local", "marketplace plugin source must be local")
        validation.require(isinstance(path, str) and (ROOT / path).is_dir(), f"marketplace source path does not exist: {path}")


def validate_plugin(validation: Validation) -> None:
    data = load_json(PLUGIN_MANIFEST, validation)
    validation.require(data.get("name") == PLUGIN_ROOT.name, "plugin manifest name must match its directory")
    validation.require(bool(SEMVER.fullmatch(str(data.get("version", "")))), "plugin version must be semantic versioning")
    validation.require(data.get("skills") == "./skills/", "plugin skills path must be ./skills/")
    validation.require(isinstance(data.get("description"), str) and bool(data.get("description", "").strip()), "plugin description is required")


def validate_skill(skill_dir: Path, validation: Validation) -> None:
    relative = skill_dir.relative_to(ROOT)
    skill_file = skill_dir / "SKILL.md"
    agent_file = skill_dir / "agents" / "openai.yaml"
    validation.require(skill_file.is_file(), f"{relative}: missing SKILL.md")
    validation.require(agent_file.is_file(), f"{relative}: missing agents/openai.yaml")
    if not skill_file.is_file():
        return

    metadata, body = parse_frontmatter(skill_file, validation)
    validation.require(set(metadata) == {"name", "description"}, f"{relative}/SKILL.md: frontmatter must contain only name and description")
    name = metadata.get("name", "")
    description = metadata.get("description", "")
    validation.require(bool(SKILL_NAME.fullmatch(name)), f"{relative}: invalid skill name {name!r}; use lowercase kebab-case")
    validation.require(name == skill_dir.name, f"{relative}: directory name must match frontmatter name {name!r}")
    validation.require(20 <= len(description) <= 1024, f"{relative}: description must be 20-1024 characters")
    validation.require(bool(body.strip()), f"{relative}/SKILL.md: instruction body is empty")
    validation.require(len(skill_file.read_text(encoding="utf-8").splitlines()) <= 500, f"{relative}/SKILL.md: keep the file at or below 500 lines")

    forbidden = sorted(path.name for path in skill_dir.iterdir() if path.name in FORBIDDEN_SKILL_DOCS)
    validation.require(not forbidden, f"{relative}: move repository-level docs out of the skill: {', '.join(forbidden)}")

    if agent_file.is_file():
        yaml_text = agent_file.read_text(encoding="utf-8")
        display_name = quoted_yaml_value(yaml_text, "display_name")
        short_description = quoted_yaml_value(yaml_text, "short_description")
        default_prompt = quoted_yaml_value(yaml_text, "default_prompt")
        validation.require(display_name is not None, f"{agent_file.relative_to(ROOT)}: display_name must be quoted")
        validation.require(short_description is not None and 25 <= len(short_description) <= 64, f"{agent_file.relative_to(ROOT)}: short_description must be quoted and 25-64 characters")
        validation.require(default_prompt is not None and f"${name}" in default_prompt, f"{agent_file.relative_to(ROOT)}: default_prompt must be quoted and mention ${name}")


def validate_scripts(validation: Validation) -> None:
    node = shutil.which("node")
    cjs_files = sorted(SKILLS_ROOT.rglob("*.cjs"))
    validation.require(node is not None or not cjs_files, "Node.js is required to validate bundled .cjs scripts")
    if node:
        for path in cjs_files:
            result = subprocess.run([node, "--check", str(path)], capture_output=True, text=True)
            if result.returncode:
                validation.errors.append(f"{path.relative_to(ROOT)}: Node syntax check failed\n{result.stderr.strip()}")
            else:
                validation.note(f"Node syntax: {path.relative_to(ROOT)}")


def validate_checksums(validation: Validation) -> None:
    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "update_checksums.py"), "--check"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    if result.returncode:
        validation.errors.append(result.stdout.strip() or result.stderr.strip())
    else:
        validation.note(result.stdout.strip().removeprefix("OK: "))


def main() -> int:
    validation = Validation()
    for filename in REQUIRED_ROOT_FILES:
        validation.require((ROOT / filename).is_file(), f"missing repository file: {filename}")

    validation.require(MARKETPLACE.is_file(), "missing .agents/plugins/marketplace.json")
    validation.require(PLUGIN_MANIFEST.is_file(), "missing plugin.json")
    if MARKETPLACE.is_file():
        validate_marketplace(validation)
    if PLUGIN_MANIFEST.is_file():
        validate_plugin(validation)

    skill_dirs = sorted(path for path in SKILLS_ROOT.iterdir() if path.is_dir()) if SKILLS_ROOT.is_dir() else []
    validation.require(bool(skill_dirs), "plugin must contain at least one skill")
    for skill_dir in skill_dirs:
        validate_skill(skill_dir, validation)

    validate_scripts(validation)
    validate_checksums(validation)

    for note in validation.notes:
        print(f"OK: {note}")
    if validation.errors:
        for error in validation.errors:
            print(f"ERROR: {error}", file=sys.stderr)
        print(f"Validation failed with {len(validation.errors)} error(s).", file=sys.stderr)
        return 1

    print(f"Repository validation passed: {len(skill_dirs)} skills.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
