export const BRIEFING_MAX_WORDS = 200;
export const BRIEFING_MAX_ITEMS = 8;
export const SCORE_MIN = 0;
export const SCORE_MAX = 1;

export const MEMORY_KINDS = ['semantic', 'episodic', 'procedural', 'project'] as const;
export const MEMORY_STATUSES = ['active', 'superseded', 'archived', 'deprecated'] as const;
export const CANDIDATE_STATUSES = ['pending', 'approved', 'rejected'] as const;
export const MEMORY_MODES = ['strict', 'demo'] as const;

export const MEMORY_STORE_FILES = {
  semantic: '.memory/semantic-memories.jsonl',
  episodic: '.memory/episodic-memories.jsonl',
  procedural: '.memory/procedural-memories.jsonl',
  project: '.memory/project-memories.jsonl',
  pendingCandidates: '.memory/candidates/pending.jsonl',
  approvedCandidates: '.memory/candidates/approved.jsonl',
  rejectedCandidates: '.memory/candidates/rejected.jsonl',
  latestSession: '.memory/sessions/latest.jsonl',
  audit: '.memory/audit/memory-events.jsonl',
} as const;
