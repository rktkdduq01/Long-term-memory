# Schemas

This directory contains the canonical JSON Schema contracts for the local Codex CLI memory harness.

## Schema Catalog

| Schema | Purpose |
| --- | --- |
| `task.schema.json` | Task input used by briefing and retrieval. |
| `session-event.schema.json` | Local session event records stored in `.memory/sessions/latest.jsonl`. |
| `memory.schema.json` | Approved durable memory records stored in the semantic, episodic, procedural, and project JSONL stores. |
| `memory-candidate.schema.json` | Pending, approved, or rejected candidate records. Generated candidates are pending until explicit approval. |
| `briefing.schema.json` | Compact pre-task briefing for Codex CLI. |
| `approval-event.schema.json` | Audit records for candidate generation, approval, rejection, and supersession. |

## Shared Rules

- Confidence, relevance, usefulness, and importance scores are numbers from `0` to `1`.
- Briefings use `BRIEFING_MAX_WORDS = 200`.
- Briefings use `BRIEFING_MAX_ITEMS = 8`.
- All retained memory and candidates require structured evidence.
- `additionalProperties: false` is required at schema object boundaries.
- Broken local JSONL must fail validation; the runtime must not silently fall back to demo fixtures.
