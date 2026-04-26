import type { MemoryCandidate } from '../contracts/types.ts';

export const sampleCandidates: MemoryCandidate[] = [
  {
    candidate_id: 'cand_demo_local_only',
    target_kind: 'semantic',
    memory_type: 'repo_rule',
    gist: 'The memory harness must stay local-only and must not add server, MCP, daemon, network, or OpenAI API requirements.',
    fact_or_inference: 'fact',
    status: 'pending',
    scope_type: 'repo',
    scope_value: 'rktkdduq01/Long-term-memory',
    confidence: 0.98,
    future_usefulness: 0.97,
    created_at: '2026-04-26T00:00:00Z',
    evidence_refs: [
      {
        source_type: 'user_message',
        source_id: 'demo-user-request',
        quote_or_summary: 'The user explicitly required local-only operation with no server, MCP, background daemon, network, or OpenAI API calls.',
        observed_at: '2026-04-26T00:00:00Z',
        trust_level: 'trusted',
      },
    ],
    source_trust_level: 'trusted',
    sensitivity: 'public',
    why_keep: 'It is a durable repository boundary for future implementation work.',
    supersedes: [],
    conflicts: [],
  },
];
