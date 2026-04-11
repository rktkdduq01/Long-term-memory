# Memory Harness Repository

This repository packages prompt templates for a conservative memory subsystem.

## Operating Rules

- Separate facts from inferences.
- Do not invent memories.
- Do not promote temporary observations into durable memory unless they show lasting value.
- Prefer concise, structured outputs over prose.
- Require evidence or provenance for every retained memory.
- Mark uncertainty explicitly.
- Flag conflicts instead of silently overwriting.
- Optimize for future task usefulness, not for completeness.
- Store only information likely to improve future performance, consistency, or safety.
- Return JSON only when a prompt explicitly requests a schema.

## Prompt Map

- Base contract: `prompts/base-memory-harness.md`
- Task-time memory selection: `prompts/select-memories-for-task.md`
- Agent handoff briefing: `prompts/prepare-task-memory-briefing.md`
- Session-end candidate extraction: `prompts/extract-candidate-memories.md`
- Session distillation: `prompts/distill-session-memory.md`
- Long-term semantic promotion decisions: `prompts/decide-semantic-promotion.md`
- Semantic conflict resolution: `prompts/resolve-memory-conflicts.md`
- Semantic memory consolidation: `prompts/consolidate-semantic-memories.md`
- Long-term memory decay management: `prompts/manage-memory-decay.md`

## Working Pattern

1. Use the base contract when defining or validating default memory behavior.
2. Use the task selection prompt before active work begins.
3. Use the briefing prompt to hand off compact, actionable context.
4. Use the extraction and distillation prompts after work is complete.
5. Use the semantic promotion prompt before writing durable memories into long-term storage.
6. Use the conflict resolution prompt when new candidates overlap or disagree with existing semantic memory.
7. Use the consolidation prompt to compress semantic memory while preserving provenance, scope, and exceptions.
8. Use the decay management prompt to lower detail or confidence over time without losing durable constraints.
9. If placeholders are unresolved or evidence is thin, return minimal output instead of guessing.
