# Codex CLI Automation Policy

This repository supports local Codex CLI automation only.

Allowed automation:

- load and render prompt contracts
- validate JSON against local schemas
- read and write local JSONL files under `.memory/`
- generate pending memory candidates from local session events
- approve or reject candidates when the user explicitly invokes the command

Disallowed automation:

- servers
- MCP services
- background daemons
- network calls
- OpenAI API calls
- vector databases or remote stores
- automatic permanent memory writes

Use npm scripts as the public interface:

- `memory:briefing`
- `memory:search`
- `memory:candidates`
- `memory:approve`
- `memory:reject`
- `memory:validate`
