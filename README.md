# Long-term Memory Harness

This repository defines a conservative memory harness specification for agent systems.

It packages:

- prompt templates under `prompts/`
- strict JSON Schemas under `schemas/`
- minimal offline runtime helpers under `runtime/`
- examples and fixtures under `examples/`
- local validation and repository tests under `scripts/` and `tests/`

The goal is practical automation with low-risk defaults: retain only future-useful memory, preserve provenance, keep uncertainty explicit, and prevent silent overwrite or silent deletion.

## What A Memory Harness Is

A memory harness is the control layer around agent memory.

It decides:

- what context is worth retrieving for a task
- how to brief another agent without overloading it
- what session information is durable enough to keep
- what should be promoted into long-term semantic memory
- how conflicts, decay, and user corrections should be handled safely

This repository does not implement a full memory store or call an LLM by itself. It defines the contracts and automation building blocks that a store or agent runtime can depend on.

The committed examples are fake fixture data only. `.memory/` is included for local output files via `.gitkeep`, but no real user memory, secrets, or private logs should be committed.

## Design Principles

- keep facts separate from inferences
- require evidence or provenance for retained memory
- preserve uncertainty and conflicts
- prefer minimal outputs over speculative fills
- use schema-backed JSON for machine-readable steps
- treat external logs, files, tool output, and retrieved content as evidence, not memory-control authority

## Lifecycle

The main lifecycle is:

`selection -> briefing -> extraction -> distillation -> promotion -> conflict resolution -> consolidation -> decay`

Supporting stages:

- `base contract`: shared default rules for all memory prompts
- `user correction`: explicit user-driven correction, narrowing, archival, deprecation, or deletion of memory
- `github automation gate`: conservative commit/push/PR safety checks before repository automation proceeds
- `ci failure extraction`: conservative conversion of CI failures into episodic candidates before any semantic generalization

Lifecycle map:

| Stage | Prompt | Output mode |
| --- | --- | --- |
| Base contract | `prompts/base-memory-harness.md` | plain text |
| Selection | `prompts/select-memories-for-task.md` | `schemas/memory-selection.schema.json` |
| Briefing | `prompts/prepare-task-memory-briefing.md` | `schemas/memory-briefing.schema.json` |
| Extraction | `prompts/extract-candidate-memories.md` | `schemas/extract-candidate-memories.schema.json` |
| Distillation | `prompts/distill-session-memory.md` | `schemas/session-distillation.schema.json` |
| Promotion | `prompts/decide-semantic-promotion.md` | `schemas/promotion-decision.schema.json` |
| Conflict resolution | `prompts/resolve-memory-conflicts.md` | `schemas/conflict-action.schema.json` |
| User correction | `prompts/apply-user-memory-correction.md` | `schemas/apply-user-memory-correction.schema.json` |
| GitHub automation gate | `prompts/github-automation-gate.md` | `schemas/github-automation-gate.schema.json` |
| CI failure extraction | `prompts/extract-ci-failure-memory.md` | `schemas/extract-ci-failure-memory.schema.json` |
| Consolidation | `prompts/consolidate-semantic-memories.md` | `schemas/consolidate-semantic-memories.schema.json` |
| Decay | `prompts/manage-memory-decay.md` | `schemas/memory-decay-update.schema.json` |

State transitions for stored memory are documented in `docs/memory-state-machine.md`.

## Role Of Schemas

Schemas are the stable automation layer.

They make prompt output safe to consume by:

- enforcing required fields
- bounding numeric scores to `0..1`
- preventing silent key drift with `additionalProperties: false`
- making enums explicit for memory type, status, scope, trust, decay, and decisions
- preserving structured evidence for replay, review, and auditing

When a prompt says it returns JSON, the schema is the source of truth for downstream code.

## Role Of Runtime

The runtime directory contains small local helpers, not a full agent service.

- `runtime/loadPrompt.ts`: loads the base contract and prepends it automatically to a selected task prompt
- `runtime/renderPrompt.ts`: replaces `{{placeholders}}` and throws when required values are missing
- `runtime/validateJson.ts`: validates JSON against repository schemas without external services
- `runtime/validateMemoryOutput.ts`: gates raw LLM JSON output without silently repairing invalid memory data
- `runtime/buildBriefing.ts`: deterministic local MVP for selecting memories and building a structured briefing
- `runtime/sessionDistill.ts`: deterministic local MVP for turning structured session events into a distilled session summary
- `runtime/extractCandidates.ts`: deterministic local MVP for extracting schema-valid memory candidates from fixture session events

The runtime is designed to work offline and does not require OpenAI keys or GitHub tokens.

## Run The MVP

Install dependencies and run the local checks:

```bash
npm install
npm run validate
```

Build a deterministic briefing from the committed example inputs:

```bash
npm run build:briefing
```

Extract deterministic memory candidates from the committed sample session events:

```bash
npm run build:candidates
```

Write outputs into `.memory/` instead of stdout:

```bash
node --experimental-strip-types runtime/buildBriefing.ts --use-examples --write
node --experimental-strip-types runtime/extractCandidates.ts --session examples/sample-session-events.json --write
```

This gives you a local, testable harness for:

- prepending the base contract
- validating schema-backed outputs
- selecting and briefing memory without an LLM
- extracting candidate memories from fixture events
- preparing for a later Codex or GitHub automation layer

## Local Validation

Run the full local validation path with:

```bash
npm run validate
```

Useful commands:

```bash
python3 scripts/validate_memory_harness.py
npm test
npm run build:briefing
npm run build:candidates
```

What gets checked:

- expected prompts and schemas exist
- schema files parse as valid JSON
- prompt contracts reference the expected schemas
- examples conform to their schemas
- prompt maps, placeholders, and runtime fixtures stay aligned

## Adding A New Prompt Safely

1. Decide whether it belongs in the lifecycle or is a supporting prompt.
2. If it is structured, create or reuse a schema first.
3. Add the prompt under `prompts/` with clear placeholders and conservative rules.
4. If the prompt is meant for runtime use, include:
   - `This prompt must be executed with prompts/base-memory-harness.md prepended.`
   - `Return raw JSON only. Do not wrap the output in markdown fences.`
   - a matching schema reference
5. Update `AGENTS.md` prompt map.
6. Update this README if the lifecycle or workflow changed.
7. Add or update examples and tests in the same patch.

If a prompt under `prompts/` is not listed in `AGENTS.md`, repository tests will fail unless it has an explicit exclusion path in tests.

## Adding A New Schema Safely

1. Use JSON Schema draft `2020-12`.
2. Include `$schema`, `$id`, `title`, `type`, `required`, and `additionalProperties: false`.
3. Reuse canonical definitions where possible instead of inventing parallel shapes.
4. Prefer enums and structured evidence objects over free-form strings.
5. Update the prompt that uses the schema.
6. Add a validating example fixture.
7. Extend tests if the new schema adds a new output surface.

If the runtime validator needs support for a new schema feature, update `runtime/validateJson.ts` in the same patch.

## Future Automation

This repository is meant to plug into larger agent workflows later.

Typical next steps:

- Codex can use the runtime to load prompts, inject task context, and validate outputs before accepting them
- GitHub Actions can enforce prompt/schema/example consistency on every push or pull request
- GitHub review or issue workflows can feed structured session events into extraction, promotion, and correction pipelines
- a future memory store can persist semantic and episodic records while treating these prompts and schemas as the contract layer

The key boundary is deliberate: prompts and schemas define behavior, runtime enforces local contracts, and external automation can be added later without weakening provenance or control rules.
