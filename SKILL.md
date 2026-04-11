---
name: memory-harness
description: Use this skill when you need to select, brief, extract, or distill agent memory with conservative, evidence-based rules and compact structured outputs.
---

# Memory Harness

Use this skill for memory operations inside an agent system. The goal is to retain only durable, future-useful information and avoid speculative or noisy memory writes.

## Core Behavior

- Read only the prompt file needed for the current step.
- Treat unresolved placeholders as missing input.
- Prefer empty or minimal outputs over guessed memories.
- Keep facts separate from inferences.
- Preserve evidence, uncertainty, and conflict markers.

## Prompt Map

- Base contract: `prompts/base-memory-harness.md`
- Memory selection for the current task: `prompts/select-memories-for-task.md`
- Compact task briefing for another agent: `prompts/prepare-task-memory-briefing.md`
- Candidate memory extraction from a session: `prompts/extract-candidate-memories.md`
- Completed-session distillation: `prompts/distill-session-memory.md`
- Long-term semantic promotion decisions: `prompts/decide-semantic-promotion.md`
- Semantic conflict resolution: `prompts/resolve-memory-conflicts.md`
- Semantic memory consolidation: `prompts/consolidate-semantic-memories.md`
- Long-term memory decay management: `prompts/manage-memory-decay.md`

## Recommended Workflow

1. Start with `prompts/base-memory-harness.md` when wiring a memory component or aligning behavior.
2. Run `prompts/select-memories-for-task.md` before task execution.
3. Run `prompts/prepare-task-memory-briefing.md` when another agent needs a compact working brief.
4. Run `prompts/extract-candidate-memories.md` after a turn or session to capture durable candidates.
5. Run `prompts/distill-session-memory.md` after validation to preserve durable lessons and unresolved risks.
6. Run `prompts/decide-semantic-promotion.md` before promoting candidates into long-term semantic memory.
7. Run `prompts/resolve-memory-conflicts.md` when new candidates duplicate, narrow, or conflict with existing semantic memories.
8. Run `prompts/consolidate-semantic-memories.md` when semantic memory needs deduplication, compression, or provenance-preserving cleanup.
9. Run `prompts/manage-memory-decay.md` when long-term memories need confidence or detail adjustments based on reuse and age.
