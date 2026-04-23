# Memory State Machine

This document defines the memory lifecycle states used by the harness.

Principles:
- no silent overwrite
- no silent deletion
- `deleted` requires explicit user or privacy action
- when a newer memory is narrower, prefer scope refinement over overwrite

## State Table

| State | Meaning | Created By | Allowed Next States | Retrieved For Task Briefing | Modifiable By Consolidation | User Correction Can Override |
| --- | --- | --- | --- | --- | --- | --- |
| `observed` | Seen in a session but not yet extracted into candidate memory. Usually represented in recent episodic/session records. | Session capture, episodic recorder, manual review of a session | `candidate`, `held`, `deleted` | No, except indirectly through recent session review before extraction | No | Yes |
| `candidate` | Extracted and structured, but not yet promoted into semantic memory. | Candidate extraction, session distillation, explicit user correction creating a reviewable candidate | `held`, `promoted`, `deleted` | No, except if surfaced explicitly as uncertainty during review | No | Yes |
| `held` | Potentially useful but insufficient evidence or confidence for promotion. | Promotion review, manual review, user correction | `candidate`, `promoted`, `archived`, `deleted` | Limited: only as uncertainty or caution, not as a normal durable rule | No | Yes |
| `promoted` | Accepted into semantic memory and available for normal reuse. | Promotion review, explicit user correction, explicit repository configuration import | `stable`, `fading`, `deprecated`, `deleted` | Yes | Yes | Yes |
| `stable` | Repeatedly confirmed or high-confidence semantic memory. | Confirmation, consolidation, decay management, explicit user correction | `fading`, `deprecated`, `deleted` | Yes | Yes | Yes |
| `fading` | Semantic memory losing confidence or detail because of age or low usage. | Decay management, manual review | `stable`, `archived`, `deprecated`, `deleted` | Limited: only when still relevant and preferably with caution | Yes | Yes |
| `archived` | Retained for provenance or recovery but not normally retrieved. | Decay management, consolidation, manual archival | `stable`, `deprecated`, `deleted` | No, except explicit recovery or audit use | Yes | Yes |
| `deprecated` | Superseded by newer or narrower memory, preserved instead of being silently overwritten. | Conflict resolution, consolidation, explicit user correction | `archived`, `deleted`, `stable` | No, except as conflict/provenance context | Yes | Yes |
| `deleted` | Removed by explicit user request or privacy action. Terminal state. | Explicit user correction, privacy/security action | None | No | No | No, except by creating a new memory record from fresh evidence |

## Transition Notes

- `observed` is the pre-extraction state for session findings.
- `candidate` and `held` are review states, not durable semantic memory.
- `promoted` is the entry state into semantic memory.
- `stable`, `fading`, and `archived` are normal post-promotion lifecycle states.
- `deprecated` preserves provenance when a memory is superseded.
- `deleted` is not a normal automation outcome and must not be used as a silent cleanup mechanism.

## Retrieval Rules

- Normal task briefing should prefer `promoted` and `stable`.
- `fading` may be retrieved only when still relevant and should usually be treated cautiously.
- `held`, `archived`, and `deprecated` should not be retrieved as ordinary instructions.
- `observed` should not be treated as durable briefing memory.
- `deleted` must never be retrieved.

## Consolidation Rules

- Consolidation may merge or refine `promoted`, `stable`, `fading`, `archived`, and `deprecated` records.
- Consolidation may move repeatedly confirmed `promoted` memory to `stable`.
- Consolidation may move superseded memory to `deprecated`.
- Consolidation must not silently delete memories.
- When a newer memory is narrower, consolidation should preserve the narrower scope instead of widening it.

## Override Rules

- Direct user correction can override any state except `deleted` in place.
- If a `deleted` memory needs to exist again, create a new record from fresh evidence instead of silently reviving the old one.
