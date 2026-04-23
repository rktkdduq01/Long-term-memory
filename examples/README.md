# Examples

This directory contains realistic but fake fixtures for the memory harness lifecycle.

## Lifecycle Mapping

- `sample-task.json`: representative task input for selection or briefing flows.
- `sample-semantic-memories.json`: semantic memory input fixture with a repo rule, a user preference, a recent failure lesson, a stale memory, and an unresolved conflict example.
- `sample-episodic-memories.json`: recent episodic input fixture for task-time selection.
- `sample-session-events.json`: representative session event input for candidate extraction or distillation.
- `sample-selection-output.json`: output example for `prompts/select-memories-for-task.md`.
- `sample-briefing-output.json`: output example for `prompts/prepare-task-memory-briefing.md`.
- `sample-candidate-output.json`: output example for `prompts/extract-candidate-memories.md`.
- `sample-promotion-output.json`: output example for `prompts/decide-semantic-promotion.md`.

## Validation Usage

The schema-backed examples are used in `runtime/runtime.test.ts`.

- `sample-semantic-memories.json`: each memory is validated against `schemas/semantic-memory.schema.json`.
- `sample-episodic-memories.json`: each memory is validated against `schemas/episodic-memory.schema.json`.
- `sample-selection-output.json`: validated against `schemas/memory-selection.schema.json`.
- `sample-briefing-output.json`: validated against `schemas/memory-briefing.schema.json`.
- `sample-candidate-output.json`: validated against `schemas/extract-candidate-memories.schema.json`.
- `sample-promotion-output.json`: validated against `schemas/promotion-decision.schema.json`.

`sample-task.json` and `sample-session-events.json` are currently input fixtures only. They are parsed in tests for shape sanity, but they are not yet governed by canonical schemas.

## Adding More Examples

- Keep example data fake and non-sensitive. Never include real secrets, tokens, credentials, or personal data.
- Prefer examples that exercise conservative behavior: uncertainty, conflicts, held candidates, and provenance should be visible.
- When adding a schema-backed output example, also add or update a test that validates it against the matching schema.
- If a prompt or schema changes, update the corresponding example in the same patch so fixtures do not drift.
