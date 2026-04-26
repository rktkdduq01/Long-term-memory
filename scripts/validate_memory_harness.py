#!/usr/bin/env python3

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent

BASE_PROMPT_REQUIREMENT = "This prompt must be executed with `prompts/base-memory-harness.md` prepended."
RAW_JSON_REQUIREMENT = "Return raw JSON only. Do not wrap the output in markdown fences."

PROMPTS = {
    "base-memory-harness.md": None,
    "pre-task-briefing.md": "schemas/briefing.schema.json",
    "post-task-distillation.md": "schemas/memory-candidate.schema.json",
    "memory-conflict-check.md": "schemas/memory-candidate.schema.json",
    "memory-approval.md": "schemas/approval-review.schema.json",
    "local-memory-search.md": "schemas/memory.schema.json",
}

SCHEMAS = [
    "schemas/task.schema.json",
    "schemas/session-event.schema.json",
    "schemas/memory.schema.json",
    "schemas/memory-candidate.schema.json",
    "schemas/briefing.schema.json",
    "schemas/approval-review.schema.json",
    "schemas/approval-event.schema.json",
]


def require(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def load_json_file(path: Path, errors: list[str]) -> object | None:
    require(path.exists(), f"missing file: {path.relative_to(ROOT)}", errors)
    if not path.exists():
        return None

    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        errors.append(f"invalid JSON in {path.relative_to(ROOT)}: {exc}")
        return None


def placeholders(content: str) -> list[str]:
    return sorted(set(re.findall(r"{{\s*([a-zA-Z0-9_]+)\s*}}", content)))


def validate_schema(schema_path: Path, errors: list[str]) -> None:
    data = load_json_file(schema_path, errors)
    if not isinstance(data, dict):
        errors.append(f"schema must be a JSON object: {schema_path.relative_to(ROOT)}")
        return

    required = {"$schema", "$id", "title", "type", "required", "additionalProperties"}
    missing = sorted(required - set(data))
    require(not missing, f"schema missing keys {missing}: {schema_path.relative_to(ROOT)}", errors)
    require(
        data.get("$schema") == "https://json-schema.org/draft/2020-12/schema",
        f"schema must use draft 2020-12: {schema_path.relative_to(ROOT)}",
        errors,
    )
    require(data.get("type") == "object", f"schema root type must be object: {schema_path.relative_to(ROOT)}", errors)
    require(data.get("additionalProperties") is False, f"schema root must disallow extra properties: {schema_path.relative_to(ROOT)}", errors)


def main() -> int:
    errors: list[str] = []

    prompt_files = sorted(path.name for path in (ROOT / "prompts").glob("*.md"))
    schema_files = sorted(path.relative_to(ROOT).as_posix() for path in (ROOT / "schemas").glob("*.schema.json"))

    require(prompt_files == sorted(PROMPTS), f"prompt inventory drift: {prompt_files}", errors)
    require(schema_files == sorted(SCHEMAS), f"schema inventory drift: {schema_files}", errors)

    for prompt_name, schema_ref in PROMPTS.items():
        prompt_path = ROOT / "prompts" / prompt_name
        require(prompt_path.exists(), f"missing prompt file: prompts/{prompt_name}", errors)
        if not prompt_path.exists():
            continue

        content = prompt_path.read_text(encoding="utf-8")
        if prompt_name == "base-memory-harness.md":
            require(RAW_JSON_REQUIREMENT not in content, "base prompt must not require raw JSON output", errors)
            continue

        require(BASE_PROMPT_REQUIREMENT in content, f"missing base prompt requirement: prompts/{prompt_name}", errors)
        require(RAW_JSON_REQUIREMENT in content, f"missing raw JSON requirement: prompts/{prompt_name}", errors)
        require(schema_ref is not None and schema_ref in content, f"missing schema reference {schema_ref}: prompts/{prompt_name}", errors)

    expected_placeholders = {
        "base-memory-harness.md": [],
        "pre-task-briefing.md": [
            "approved_memories",
            "conflicted_memories",
            "now",
            "pending_candidates",
            "repo_scope",
            "task",
        ],
        "post-task-distillation.md": [
            "approved_memories",
            "existing_candidates",
            "now",
            "repo_scope",
            "session_events",
            "task",
        ],
        "memory-conflict-check.md": ["approved_memories", "now", "pending_candidates", "repo_scope"],
        "memory-approval.md": ["approved_memories", "conflict_report", "now", "pending_candidates", "repo_scope"],
        "local-memory-search.md": ["approved_memories", "now", "pending_candidates", "query", "repo_scope"],
    }

    for prompt_name, expected in expected_placeholders.items():
        actual = placeholders((ROOT / "prompts" / prompt_name).read_text(encoding="utf-8"))
        require(actual == expected, f"placeholder drift in prompts/{prompt_name}: expected {expected}, got {actual}", errors)

    for schema in SCHEMAS:
        validate_schema(ROOT / schema, errors)

    constants = (ROOT / "runtime" / "contracts" / "constants.ts").read_text(encoding="utf-8")
    require("BRIEFING_MAX_WORDS = 200" in constants, "BRIEFING_MAX_WORDS must remain 200", errors)
    require("BRIEFING_MAX_ITEMS = 8" in constants, "BRIEFING_MAX_ITEMS must remain 8", errors)
    require("SCORE_MIN = 0" in constants and "SCORE_MAX = 1" in constants, "score range constants must remain 0..1", errors)

    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1

    print("Memory harness repository validation passed.")
    print(f"Validated {len(PROMPTS)} prompts and {len(SCHEMAS)} schemas.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
