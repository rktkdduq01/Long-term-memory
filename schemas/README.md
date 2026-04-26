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
| `approval-review.schema.json` | Non-persistent review recommendations shown before the user approves or rejects pending candidates. |
| `approval-event.schema.json` | Audit records for candidate generation, approval, rejection, and supersession. |

## Shared Rules

- Confidence, relevance, usefulness, and importance scores are numbers from `0` to `1`.
- Briefings use `BRIEFING_MAX_WORDS = 200`.
- Briefings use `BRIEFING_MAX_ITEMS = 8`.
- All retained memory and candidates require structured evidence.
- `additionalProperties: false` is required at schema object boundaries.
- Broken local JSONL must fail validation; the runtime must not silently fall back to demo fixtures.

## Local Validator Subset

The schemas declare JSON Schema draft 2020-12, but `runtime/validateJson.ts` intentionally implements a local, dependency-light subset. Schema authors must not assume unsupported draft 2020-12 keywords are enforced by this harness.

Supported keywords:

- `$ref`
- `allOf`
- `if` / `then` / `else`
- `type`
- `const`
- `enum`
- `required`
- `additionalProperties: false`
- `properties`
- `items`
- `minLength`
- `maxLength`
- `minimum`
- `maximum`
- `minItems`
- `maxItems`
- `uniqueItems`
- `format: date-time`

The schemas may also use `$schema`, `$id`, `title`, and `$defs` as metadata or reference organization keys. These are not validation keywords.

Unsupported or not-yet-supported examples:

- `oneOf`
- `anyOf`
- `not`
- `pattern`
- `patternProperties`
- `dependentRequired`
- `unevaluatedProperties`
