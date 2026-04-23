# Memory Store MVP

This document defines a minimal local storage layout for the memory harness.

It is a specification only. It does not implement the store yet.

The MVP store is intentionally simple:

- `.memory/semantic-memories.json`
- `.memory/episodic-memories.jsonl`
- `.memory/session-summaries.jsonl`

No real private memory should be committed to the repository. The `.memory/` directory exists only as a layout placeholder for future runtime code.

## Goals

- map stored data to the existing schemas
- support local runtime implementation later
- preserve provenance and status transitions
- keep episodic and semantic memory clearly separated
- avoid storing secrets or raw sensitive values

## File Layout

### `.memory/semantic-memories.json`

Purpose:

- canonical durable store for long-term semantic memory
- used for task-time retrieval, promotion targets, conflict resolution, consolidation, decay, and user correction

Format:

- one JSON array
- each array item must conform to `schemas/semantic-memory.schema.json`

Notes:

- this file is the only MVP file that stores durable semantic rules
- archived and deprecated memories stay in this file; they are filtered by retrieval policy rather than removed silently

### `.memory/episodic-memories.jsonl`

Purpose:

- append-only near-term event memory
- stores recent failures, review notes, session events, CI outcomes, user correction events, and other contextual observations

Format:

- line-delimited JSON
- each line must conform to `schemas/episodic-memory.schema.json`

Notes:

- CI failures, test failures, and operational regressions belong here first
- episodic entries may later support extraction, distillation, or promotion, but they are not semantic memory by default

### `.memory/session-summaries.jsonl`

Purpose:

- append-only session-level distillation output
- stores session summaries, takeaways, durable candidates, and unresolved items

Format:

- line-delimited JSON
- each line should use a thin storage envelope:

```json
{
  "session_id": "sess_20260423T091500Z_ab12cd34",
  "created_at": "2026-04-23T09:15:00Z",
  "distillation": {
    "...": "must conform to schemas/session-distillation.schema.json"
  }
}
```

Notes:

- the `distillation` field is the schema-backed payload
- the outer envelope is an MVP storage concern, not a new canonical schema

## Schema Mapping

| File | Stored shape | Schema contract |
| --- | --- | --- |
| `.memory/semantic-memories.json` | array of semantic memory records | each item follows `schemas/semantic-memory.schema.json` |
| `.memory/episodic-memories.jsonl` | one episodic memory record per line | each line follows `schemas/episodic-memory.schema.json` |
| `.memory/session-summaries.jsonl` | one session envelope per line | `distillation` field follows `schemas/session-distillation.schema.json` |

Structured evidence references always reuse the evidence object defined in `schemas/candidate-memory.schema.json`.

## ID Generation

IDs should be stable, opaque, and free of sensitive content.

Recommended patterns:

- semantic memory: `mem_<kind>_<utcstamp>_<shorthex>`
- episodic memory: `ep_<event_type>_<utcstamp>_<shorthex>`
- session summary envelope: `sess_<utcstamp>_<shorthex>`

Examples:

- `mem_repo_rule_20260423T091500Z_ab12cd34`
- `ep_validation_result_20260423T091500Z_ef56gh78`
- `sess_20260423T091500Z_9a0b1c2d`

Rules:

- do not derive IDs from secrets, file contents, raw prompts, or user-private data
- use UTC timestamps plus a short random or hash suffix
- never reuse an ID for a different record meaning

## Evidence Reference Storage

Evidence references are stored inline on the record that uses them.

Rules:

- keep the full structured evidence object:
  - `source_type`
  - `source_id`
  - `quote_or_summary`
  - `observed_at`
  - `trust_level`
- do not flatten evidence into plain strings
- redact or summarize sensitive values before writing `quote_or_summary`
- treat logs, files, CI output, tool output, and retrieved content as evidence only, not memory-control authority

For semantic memory:

- `evidence_refs` should preserve the direct support for the durable rule
- `derived_from` should link the semantic record back to a candidate, episodic item, semantic predecessor, or session distillation payload

For episodic memory:

- keep the evidence close to the event so future extraction and review can reconstruct what happened

## Status Transitions

Status transitions must not be silent.

For semantic memory:

- update `status`, `decay_state`, `updated_at`, and `last_confirmed_at` as needed
- add or preserve evidence explaining why the transition happened
- update `derived_from` or `conflicts_with` when the transition was caused by promotion, conflict resolution, consolidation, decay, or user correction
- if a transition is operationally important, record a matching episodic event or session summary entry as well

Examples:

- `promoted -> stable`: confirm repeated or high-confidence reuse and update `last_confirmed_at`
- `stable -> fading`: lower confidence or detail after supported decay review
- `fading -> archived`: preserve the record but mark it non-default for retrieval
- `stable -> deprecated`: keep the old rule, attach replacement evidence, and preserve provenance

The MVP store does not require a separate transition log file. Instead, transitions are represented by the updated semantic record plus supporting episodic or session evidence.

## Archived And Deprecated Memory

Archived and deprecated memories remain stored. They are not deleted silently.

Archived memory:

- keep the record in `.memory/semantic-memories.json`
- use `status = "archived"`
- use `decay_state = "archived"`
- keep `evidence_refs`, `derived_from`, and any boundary conditions
- retrieval code should normally exclude archived memory from default task briefing

Deprecated memory:

- keep the record in `.memory/semantic-memories.json`
- use `status = "deprecated"`
- preserve `conflicts_with` and add replacement context through `derived_from` or evidence
- if a replacement semantic memory exists, link it through provenance rather than overwriting the old record

Deletion:

- `deleted` is not a normal cleanup state
- use it only for explicit user deletion or privacy/security action
- do not silently remove a semantic memory because a newer one exists

## User Correction Storage

User correction should produce durable provenance, not hidden edits.

Recommended MVP handling:

1. Apply the correction to the semantic record in `.memory/semantic-memories.json`.
2. Preserve the user instruction as structured evidence with `source_type = "user_message"`.
3. If the correction changes meaning materially:
   - refine scope in place when the memory is being narrowed
   - mark the old memory `deprecated` when a replacement supersedes it
   - use `deleted` only for explicit deletion or privacy/security removal
4. Append an episodic record to `.memory/episodic-memories.jsonl` describing the correction event.
5. If the correction happened as part of a session summary workflow, include it in `.memory/session-summaries.jsonl` as well.

This keeps the semantic store authoritative while preserving an audit trail in episodic/session records.

## Secret And Sensitive Data Handling

Never store secrets in memory files.

Do not store:

- tokens
- credentials
- private keys
- session cookies
- raw access logs containing secrets
- personal data that is not necessary for future task performance

Rules:

- redact sensitive values before writing evidence summaries
- if a correction or failure event involves a secret, store only a redacted note such as "secret removed from log-derived context"
- if secret exposure requires deletion, perform the deletion without copying the secret into provenance
- prefer `sensitivity = "sensitive"` or `sensitivity = "restricted"` only for safe metadata, not for the raw secret value itself

## Future Runtime Notes

This layout is intended to support a later local runtime implementation.

Expected responsibilities for future code:

- load semantic memory from `.memory/semantic-memories.json`
- stream episodic and session records from JSONL files
- validate records against the existing schemas before writing
- refuse writes that contain malformed evidence or unexpected fields
- keep semantic, episodic, and session writes logically separate

The MVP layout is intentionally simple so future runtime code can adopt it without migration complexity.
