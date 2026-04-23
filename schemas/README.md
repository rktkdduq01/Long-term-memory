# Schemas

This directory contains the canonical JSON Schema contracts for the long-term memory harness.

The canonical schemas are the stable automation layer. Existing prompt-specific schema files such as `select-memories-for-task.schema.json` remain in place for compatibility with the current prompt text, but they should compose or mirror the schemas listed below.

Lifecycle state definitions are documented in `docs/memory-state-machine.md`.

## Schema Catalog

| Schema | Purpose | Prompt / usage |
| --- | --- | --- |
| `candidate-memory.schema.json` | Canonical shape for extracted durable memory candidates with scope, evidence, trust, and sensitivity. | Used by `prompts/extract-candidate-memories.md` and by `prompts/distill-session-memory.md` for `durable_candidates`. |
| `semantic-memory.schema.json` | Canonical shape for long-term semantic memories stored after promotion or consolidation. | Used by semantic-memory storage, `prompts/consolidate-semantic-memories.md`, and as the expected record shape for selection, promotion, conflict resolution, and decay workflows. |
| `episodic-memory.schema.json` | Canonical shape for recent episodic memories or session events retained for near-term context. | Used as the expected episodic-memory input shape for `prompts/select-memories-for-task.md`. |
| `memory-selection.schema.json` | Structured output for task-time memory selection. | Used by `prompts/select-memories-for-task.md`. |
| `memory-briefing.schema.json` | Structured handoff briefing for downstream agents, split into string arrays for hard rules, soft preferences, recent cautions, uncertainties, conflicts, and a rendered compact brief. | Used by `prompts/prepare-task-memory-briefing.md`. |
| `session-distillation.schema.json` | Structured summary of a completed session, including takeaways, durable candidates, and unresolved items. | Used by `prompts/distill-session-memory.md`. |
| `promotion-decision.schema.json` | Advisory promotion recommendations for candidate memories, with per-dimension scoring rationales, runtime-weighted policy support, and target-memory linkage. | Used by `prompts/decide-semantic-promotion.md`. |
| `conflict-action.schema.json` | Conflict-resolution actions between new candidates and existing semantic memories, including machine-applicable patch objects, conflict typing, and review flags. | Used by `prompts/resolve-memory-conflicts.md`. |
| `apply-user-memory-correction.schema.json` | Structured actions for explicit user-driven correction, narrowing, archival, deprecation, deletion, or review of existing memories. | Used by `prompts/apply-user-memory-correction.md`. |
| `github-automation-gate.schema.json` | Structured safety decision for whether automation may commit, push, or open a pull request for the current change set. | Used by `prompts/github-automation-gate.md`. |
| `extract-ci-failure-memory.schema.json` | Structured episodic-memory candidates extracted from CI failures, with safe log summaries and explicit guards against premature semantic promotion. | Used by `prompts/extract-ci-failure-memory.md`. |
| `memory-decay-update.schema.json` | Decay and confidence adjustments for existing semantic memories, with structured usage signals, retrieval eligibility, and review-aware outputs. | Used by `prompts/manage-memory-decay.md`. |

## Scope Guidance

Use `scope_type` plus `scope_value`, never a single overloaded scope string.

- allowed `scope_type` values: `global_user`, `repo`, `branch`, `directory`, `file`, `task_type`, `session`
- prefer the narrowest accurate scope
- do not turn session-specific observations into global user memory
- when a new memory narrows an older one, prefer scope refinement over overwrite

## Why Strict Schemas

Strict schemas are required because memory automation is fragile when outputs drift.

- `additionalProperties: false` prevents silent key creep across runs.
- explicit enums prevent ambiguous states, decisions, and scope labels
- bounded numeric scores keep confidence and relevance comparable
- structured evidence objects preserve provenance for review and replay
- separate `scope_type` and `scope_value` avoid overloaded scope strings

Without these constraints, downstream memory storage, conflict handling, decay management, and auditing become unreliable.
