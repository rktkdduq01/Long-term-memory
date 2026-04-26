---
name: memory-harness
description: Local-first Codex CLI memory harness with prompt contracts, JSON schemas, JSONL stores, retrieval helpers, pending candidates, and explicit approval-based persistence.
---

# Memory Harness

Use this repository as a serverless, local-only memory harness for Codex CLI.

## Boundaries

- Do not add a server.
- Do not add MCP.
- Do not add background daemons.
- Do not require network access.
- Do not require OpenAI API calls.
- Do not write permanent memory automatically.

## Workflow

1. Use `prompts/pre-task-briefing.md` to prepare context from approved local memories.
2. Store session events in `.memory/sessions/latest.jsonl`.
3. Use `npm run memory:candidates` to generate pending candidates.
4. Review conflicts before persistence.
5. Use `npm run memory:approve` only after explicit user approval.
6. Use `npm run memory:reject` when a pending candidate is too weak, temporary, or unsafe.
7. Use `npm run memory:validate` before finishing contract or runtime changes.

Generated candidates go to `.memory/candidates/pending.jsonl`. Durable memory is written only after approval.
