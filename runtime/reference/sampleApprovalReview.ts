import type { ApprovalReview } from '../contracts/types.ts';
import { sampleCandidates } from './sampleCandidates.ts';

export const sampleApprovalReview: ApprovalReview = {
  generated_at: '2026-04-26T00:00:00Z',
  repo_scope: 'repo:rktkdduq01/Long-term-memory',
  recommendations: [
    {
      candidate_id: sampleCandidates[0].candidate_id,
      recommended_action: 'approve',
      reason: 'The candidate is scoped to the repository, evidence-backed by a direct user instruction, and reinforces the local-only project boundary.',
      confidence: 0.96,
      conflict_memory_ids: [],
      evidence_refs: sampleCandidates[0].evidence_refs,
      persistence_allowed: false,
    },
  ],
  warnings: [
    'This review recommendation is not approval; durable persistence still requires an explicit user approval command.',
  ],
};
