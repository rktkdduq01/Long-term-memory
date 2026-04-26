# Long-term Memory

Local-only long-term memory harness for Codex CLI.

This repository provides prompt contracts, JSON schemas, local runtime helpers, and CLI commands for working with durable memory in a serverless workflow.

## What this is

This is a local memory harness.

It helps Codex CLI:

1. read approved local memories before a task,
2. generate a concise task briefing,
3. record session events,
4. propose memory candidates after a task,
5. wait for explicit user approval,
6. persist approved memories into local JSONL files.

## What this is not

This project does not:

- start a server
- expose an MCP server
- run a background daemon
- require cloud sync
- require a remote database
- require network access
- automatically write permanent memory
- treat pending candidates as facts

## Core workflow

```txt
task
  -> memory briefing
  -> Codex work
  -> session events
  -> memory candidates
  -> user approval
  -> approved local memory
```

## Safety Boundary

Permanent memory is never written automatically.

The runtime may generate memory candidates from local session events, but those candidates are written only to `.memory/candidates/pending.jsonl`. A candidate becomes durable memory only when the user explicitly runs an approval command.

Lifecycle:

`session event -> candidate -> pending -> user approval -> approved memory`

Rejections are recorded in `.memory/candidates/rejected.jsonl`. Approval and rejection events are appended to `.memory/audit/memory-events.jsonl`.

## Local Store

The harness uses these local JSONL files:

- `.memory/semantic-memories.jsonl`
- `.memory/episodic-memories.jsonl`
- `.memory/procedural-memories.jsonl`
- `.memory/project-memories.jsonl`
- `.memory/candidates/pending.jsonl`
- `.memory/candidates/approved.jsonl`
- `.memory/candidates/rejected.jsonl`
- `.memory/sessions/latest.jsonl`
- `.memory/audit/memory-events.jsonl`

`.memory/` is ignored by git except for `.memory/.gitkeep`. Do not commit real memories, private logs, secrets, credentials, tokens, private keys, or sensitive personal data.

## Example Store

`.memory.example/` contains safe fake JSONL fixtures that demonstrate the local-only layout, including project memory that avoids server and MCP-server direction and a pending candidate that still requires approval.

For local testing, copy the example store into the ignored runtime store:

```bash
cp -R .memory.example .memory
npm run memory:validate
```

Commit `.memory.example/` when fixture contracts change. `.memory/` itself should stay local-only and uncommitted because it may contain real user, project, or session memory.

## Root Configuration

The runtime separates the harness source root from the host project root:

- `harnessRoot`: where `prompts/`, `schemas/`, and `runtime/` live
- `projectRoot`: where the local `.memory/` store lives

By default both roots point at this repository, which keeps existing in-repo usage unchanged. When vendoring or using the harness from another project, set the host project root explicitly:

```bash
npm run memory:briefing -- --project-root /path/to/project --request "Refactor local memory" --repo owner/repo
```

Environment variables are supported:

- `MEMORY_HARNESS_ROOT`: prompt/schema/runtime root
- `MEMORY_PROJECT_ROOT`: host project root for `.memory/`
- `MEMORY_REPO_SCOPE`: default repository scope for raw request and candidate generation

CLI flags override environment variables. Relative `--memory-dir` values are resolved from the project root.

## Modes

Strict local mode is the default. It reads only local task/session inputs and `.memory/` JSONL stores. Missing local memory files are treated as empty stores. Broken JSONL files fail loudly with file and line context.

Demo mode is available only when explicitly requested with `--demo`. Demo mode uses fake in-repo reference fixtures and never hides broken `.memory/` files by falling back to examples.

## Codex CLI Usage

Install dependencies and validate locally:

```bash
npm install
npm run memory:validate
```

Build a task briefing from local approved memory:

```bash
npm run memory:briefing -- --task task.json
```

Build a task briefing directly from raw request text:

```bash
npm run memory:briefing -- \
  --request "Refactor this harness" \
  --repo rktkdduq01/Long-term-memory
```

`memory:briefing` supports task files and raw request mode:

- `--task <path>`
- `--request <text>`
- `--repo <repo>`
- `--scope-type <scope_type>`
- `--scope-value <scope_value>`

Raw request mode also accepts `--branch <branch>`.

When `--request` is used, `repo` defaults to `MEMORY_REPO_SCOPE` if configured, then `"local"`. `scope_type` defaults to `"repo"` and `scope_value` defaults to the resolved repo. Task JSON files remain authoritative; CLI scope flags do not override fields loaded with `--task`.

Configure a default repository scope for local commands:

```bash
MEMORY_REPO_SCOPE=rktkdduq01/Long-term-memory npm run memory:briefing -- --request "Refactor memory briefing"
```

Search approved local memory:

```bash
npm run memory:search -- --query "schema validation"
```

Generate pending candidates from the latest local session JSONL:

```bash
npm run memory:candidates -- \
  --repo rktkdduq01/Long-term-memory
```

`memory:candidates` accepts `--repo <repo>` for repo-scoped candidate fallback. `--repo-scope <repo>` is also supported as an explicit alias. If the CLI option is omitted, candidate generation uses `MEMORY_REPO_SCOPE` and then the safe `"local"` fallback for repo-scoped candidates.

Candidate generation skips duplicate `candidate_id` values already present in pending, approved, or rejected queues. Use `--replace-pending` only when you intentionally want to replace an existing pending candidate; approved and rejected candidates are never replaced. Use `--report` to include appended, replaced, and skipped candidates in the CLI output.

Approve or reject a pending candidate:

```bash
npm run memory:approve -- \
  --candidate cand_123 \
  --reason "User approved this durable project rule."

npm run memory:reject -- \
  --candidate cand_456 \
  --reason "Too task-specific."
```

Approval requires both `--candidate <candidate_id>` and `--reason <reason>`. Rejection requires both `--candidate <candidate_id>` and `--reason <reason>`. The CLI does not create fallback audit reasons.

Run fake demo data explicitly:

```bash
npm run memory:briefing -- --demo
npm run memory:candidates -- --demo
```

## Contracts

The prompt contracts are:

- `prompts/base-memory-harness.md`
- `prompts/pre-task-briefing.md`
- `prompts/post-task-distillation.md`
- `prompts/memory-conflict-check.md`
- `prompts/memory-approval.md`
- `prompts/local-memory-search.md`

The canonical schemas are:

- `schemas/task.schema.json`
- `schemas/session-event.schema.json`
- `schemas/memory.schema.json`
- `schemas/memory-candidate.schema.json`
- `schemas/briefing.schema.json`
- `schemas/approval-review.schema.json`
- `schemas/approval-event.schema.json`

Shared contract constants live in `runtime/contracts/constants.ts`:

- `BRIEFING_MAX_WORDS = 200`
- `BRIEFING_MAX_ITEMS = 8`
- confidence, relevance, usefulness, and importance scores are always bounded from `0` to `1`

Prompts, schemas, runtime helpers, reference samples, and tests must use those same constraints.

## Runtime Layout

- `runtime/cli/`: npm-backed command entrypoints
- `runtime/config/`: local store path and mode configuration
- `runtime/contracts/`: shared constants and validation helpers
- `runtime/store/`: JSONL stores, candidate queues, sessions, and audit logging
- `runtime/retrieval/`: task normalization, scope filtering, ranking, evidence scoring, and conflict detection
- `runtime/reference/`: fake demo data used only when `--demo` is passed

The runtime helpers are deterministic and offline. They do not call models. Prompt files exist as contracts Codex can load and render when a user chooses to involve a model outside this harness.

## Validation

Use:

```bash
npm run validate
```

This runs repository contract checks, TypeScript typechecking, schema-backed store/sample checks, and the node test suite.

When changing prompt, schema, runtime, reference, or test behavior, update all affected files in the same patch. Contract drift should fail locally before it reaches a PR.
