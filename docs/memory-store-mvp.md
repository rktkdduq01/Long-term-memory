# Local JSONL Memory Store

The memory store is local-only and JSONL-backed. It is not a server, database, daemon, MCP endpoint, or remote service.

## Files

- `.memory/semantic-memories.jsonl`
- `.memory/episodic-memories.jsonl`
- `.memory/procedural-memories.jsonl`
- `.memory/project-memories.jsonl`
- `.memory/candidates/pending.jsonl`
- `.memory/candidates/approved.jsonl`
- `.memory/candidates/rejected.jsonl`
- `.memory/sessions/latest.jsonl`
- `.memory/audit/memory-events.jsonl`

Missing JSONL files are empty stores. Malformed JSONL is a hard error and must not fall back to demo data.

## Persistence Boundary

Session events may create pending candidates automatically. Permanent memory is written only when the user explicitly approves a pending candidate through `npm run memory:approve`.

Approval and rejection are audited in `.memory/audit/memory-events.jsonl`.
