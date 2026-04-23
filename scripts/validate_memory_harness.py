#!/usr/bin/env python3

from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent

BASE_PROMPT_REQUIREMENT = "This prompt must be executed with `prompts/base-memory-harness.md` prepended."
RAW_JSON_REQUIREMENT = "Return raw JSON only. Do not wrap the output in markdown fences."

PROMPT_SEQUENCE = [
    ("base contract", ROOT / "prompts" / "base-memory-harness.md", None),
    ("selection", ROOT / "prompts" / "select-memories-for-task.md", ROOT / "schemas" / "memory-selection.schema.json"),
    ("briefing", ROOT / "prompts" / "prepare-task-memory-briefing.md", ROOT / "schemas" / "memory-briefing.schema.json"),
    ("extraction", ROOT / "prompts" / "extract-candidate-memories.md", ROOT / "schemas" / "extract-candidate-memories.schema.json"),
    ("distillation", ROOT / "prompts" / "distill-session-memory.md", ROOT / "schemas" / "session-distillation.schema.json"),
    ("promotion", ROOT / "prompts" / "decide-semantic-promotion.md", ROOT / "schemas" / "promotion-decision.schema.json"),
    ("conflict resolution", ROOT / "prompts" / "resolve-memory-conflicts.md", ROOT / "schemas" / "conflict-action.schema.json"),
    ("user correction", ROOT / "prompts" / "apply-user-memory-correction.md", ROOT / "schemas" / "apply-user-memory-correction.schema.json"),
    ("github automation gate", ROOT / "prompts" / "github-automation-gate.md", ROOT / "schemas" / "github-automation-gate.schema.json"),
    ("ci failure extraction", ROOT / "prompts" / "extract-ci-failure-memory.md", ROOT / "schemas" / "extract-ci-failure-memory.schema.json"),
    ("consolidation", ROOT / "prompts" / "consolidate-semantic-memories.md", ROOT / "schemas" / "consolidate-semantic-memories.schema.json"),
    ("decay", ROOT / "prompts" / "manage-memory-decay.md", ROOT / "schemas" / "memory-decay-update.schema.json"),
]

CANONICAL_SCHEMAS = [
    ROOT / "schemas" / "candidate-memory.schema.json",
    ROOT / "schemas" / "semantic-memory.schema.json",
    ROOT / "schemas" / "episodic-memory.schema.json",
    ROOT / "schemas" / "memory-selection.schema.json",
    ROOT / "schemas" / "memory-briefing.schema.json",
    ROOT / "schemas" / "session-distillation.schema.json",
    ROOT / "schemas" / "promotion-decision.schema.json",
    ROOT / "schemas" / "conflict-action.schema.json",
    ROOT / "schemas" / "apply-user-memory-correction.schema.json",
    ROOT / "schemas" / "github-automation-gate.schema.json",
    ROOT / "schemas" / "extract-ci-failure-memory.schema.json",
    ROOT / "schemas" / "memory-decay-update.schema.json",
]

SCHEMA_README = ROOT / "schemas" / "README.md"


def require(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def load_json_file(path: Path, errors: list[str]) -> dict | list | None:
    require(path.exists(), f"missing file: {path.relative_to(ROOT)}", errors)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        errors.append(f"invalid JSON in {path.relative_to(ROOT)}: {exc}")
        return None


def validate_schema_file(schema_path: Path, errors: list[str]) -> dict | list | None:
    require(schema_path.exists(), f"missing schema file: {schema_path.relative_to(ROOT)}", errors)
    if not schema_path.exists():
        return None
    return load_json_file(schema_path, errors)


def validate_canonical_schema(schema_path: Path, errors: list[str]) -> None:
    data = validate_schema_file(schema_path, errors)
    if not isinstance(data, dict):
        if data is not None:
            errors.append(f"canonical schema must be a JSON object: {schema_path.relative_to(ROOT)}")
        return

    required_keys = {"$schema", "$id", "title", "type", "required", "additionalProperties"}
    missing_keys = sorted(required_keys - set(data.keys()))
    require(not missing_keys, f"canonical schema missing keys {missing_keys}: {schema_path.relative_to(ROOT)}", errors)
    require(
        data.get("$schema") == "https://json-schema.org/draft/2020-12/schema",
        f"canonical schema must use draft 2020-12: {schema_path.relative_to(ROOT)}",
        errors,
    )
    require(data.get("type") == "object", f"canonical schema root type must be object: {schema_path.relative_to(ROOT)}", errors)
    require(isinstance(data.get("required"), list), f"canonical schema required must be an array: {schema_path.relative_to(ROOT)}", errors)
    require(data.get("additionalProperties") is False, f"canonical schema must set additionalProperties to false: {schema_path.relative_to(ROOT)}", errors)


def main() -> int:
    errors: list[str] = []

    for _, prompt_path, schema_path in PROMPT_SEQUENCE:
        require(prompt_path.exists(), f"missing prompt file: {prompt_path.relative_to(ROOT)}", errors)
        if schema_path is not None:
            validate_schema_file(schema_path, errors)

    require(SCHEMA_README.exists(), f"missing file: {SCHEMA_README.relative_to(ROOT)}", errors)
    for schema_path in CANONICAL_SCHEMAS:
        validate_canonical_schema(schema_path, errors)

    for _, prompt_path, schema_path in PROMPT_SEQUENCE:
        if not prompt_path.exists():
            continue
        content = prompt_path.read_text(encoding="utf-8")
        if schema_path is None:
            require("Return JSON matching" not in content, f"unexpected schema instruction in plain-text prompt: {prompt_path.relative_to(ROOT)}", errors)
            continue
        require(BASE_PROMPT_REQUIREMENT in content, f"missing base-prompt requirement: {prompt_path.relative_to(ROOT)}", errors)
        require(RAW_JSON_REQUIREMENT in content, f"missing raw-JSON requirement: {prompt_path.relative_to(ROOT)}", errors)
        schema_ref = schema_path.relative_to(ROOT).as_posix()
        require(schema_ref in content, f"prompt does not reference expected schema {schema_ref}: {prompt_path.relative_to(ROOT)}", errors)

    prompt_files = list((ROOT / "prompts").glob("*.md"))
    schema_files = list((ROOT / "schemas").glob("*.schema.json"))
    require(len(prompt_files) == 12, f"expected 12 prompts, found {len(prompt_files)}", errors)
    require(len(schema_files) >= len(CANONICAL_SCHEMAS), f"expected at least {len(CANONICAL_SCHEMAS)} schemas, found {len(schema_files)}", errors)

    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1

    print("Memory harness repository validation passed.")
    print(f"Validated {len(prompt_files)} prompts and {len(schema_files)} schemas.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
