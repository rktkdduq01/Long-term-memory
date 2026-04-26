import type { MemoryRecord, SessionEventRecord, TaskInput } from '../contracts/types.ts';

export const sampleTask: TaskInput = {
  task_id: 'task_demo_local_memory',
  user_request: 'Refactor the repository into a local-only Codex CLI memory harness.',
  repo: 'rktkdduq01/Long-term-memory',
  branch: 'main',
  scope_type: 'repo',
  scope_value: 'rktkdduq01/Long-term-memory',
  metadata: {
    task_type: 'repository_refactor',
  },
};

export const sampleMemories: MemoryRecord[] = [
  {
    memory_id: 'mem_demo_local_only',
    kind: 'semantic',
    memory_type: 'repo_rule',
    gist: 'This repository must remain a local-only Codex CLI memory harness with no server, MCP, daemon, network, or OpenAI API requirement.',
    scope_type: 'repo',
    scope_value: 'rktkdduq01/Long-term-memory',
    confidence: 0.98,
    importance: 0.99,
    status: 'active',
    created_at: '2026-04-26T00:00:00Z',
    updated_at: '2026-04-26T00:00:00Z',
    evidence_refs: [
      {
        source_type: 'user_message',
        source_id: 'demo-user-request',
        quote_or_summary: 'The user required local-only operation and explicitly ruled out server, MCP, daemons, network, and OpenAI API calls.',
        observed_at: '2026-04-26T00:00:00Z',
        trust_level: 'trusted',
      },
    ],
    source_trust_level: 'trusted',
    sensitivity: 'public',
    supersedes: [],
    superseded_by: null,
    conflicts: [],
  },
  {
    memory_id: 'mem_demo_approval',
    kind: 'project',
    memory_type: 'approval_boundary',
    gist: 'Permanent memory is written only after explicit user approval; generated candidates stay pending.',
    scope_type: 'repo',
    scope_value: 'rktkdduq01/Long-term-memory',
    confidence: 0.97,
    importance: 0.97,
    status: 'active',
    created_at: '2026-04-26T00:00:00Z',
    updated_at: '2026-04-26T00:00:00Z',
    evidence_refs: [
      {
        source_type: 'user_message',
        source_id: 'demo-user-request',
        quote_or_summary: 'The user required approval-based memory persistence and no automatic permanent memory writes.',
        observed_at: '2026-04-26T00:00:00Z',
        trust_level: 'trusted',
      },
    ],
    source_trust_level: 'trusted',
    sensitivity: 'public',
    supersedes: [],
    superseded_by: null,
    conflicts: [],
  },
];

export const sampleSessionEvents: SessionEventRecord[] = [
  {
    event_id: 'evt_demo_user_direction',
    event_type: 'user_request',
    source_type: 'user_message',
    source_id: 'demo-user-request',
    observed_at: '2026-04-26T00:00:00Z',
    summary: 'The user required a serverless, local-first Codex CLI memory harness with approval-gated persistence.',
    related_files: ['README.md', 'AGENTS.md'],
    trust_level: 'trusted',
    metadata: {},
  },
  {
    event_id: 'evt_demo_validation',
    event_type: 'validation_result',
    source_type: 'test_result',
    source_id: 'demo-local-validation',
    observed_at: '2026-04-26T00:05:00Z',
    summary: 'Local validation should fail on broken .memory JSONL rather than falling back to demo fixtures.',
    related_files: ['runtime/store/jsonlStore.ts'],
    trust_level: 'partially_trusted',
    metadata: {},
  },
];
