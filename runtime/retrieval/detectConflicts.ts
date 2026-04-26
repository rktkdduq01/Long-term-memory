import type { ConflictRef, MemoryCandidate, MemoryRecord } from '../contracts/types.ts';

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokenSet(value: string): Set<string> {
  return new Set(normalizeText(value).split(/\s+/).filter((token) => token.length > 2));
}

function overlapScore(left: string, right: string): number {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return shared / Math.min(leftTokens.size, rightTokens.size);
}

function hasNegation(value: string): boolean {
  return /\b(no|not|never|must not|do not|without)\b/i.test(value);
}

function conflictFor(candidate: MemoryCandidate, memory: MemoryRecord): ConflictRef | null {
  if (candidate.supersedes.includes(memory.memory_id)) {
    return {
      memory_id: memory.memory_id,
      conflict_type: 'supersedes',
      note: `Candidate explicitly supersedes ${memory.memory_id}.`,
      confidence: 1,
    };
  }

  const overlap = overlapScore(candidate.gist, memory.gist);

  if (normalizeText(candidate.gist) === normalizeText(memory.gist) || overlap >= 0.92) {
    return {
      memory_id: memory.memory_id,
      conflict_type: 'duplicate',
      note: `Candidate duplicates approved memory ${memory.memory_id}.`,
      confidence: Math.min(1, overlap || 1),
    };
  }

  const sameScope = candidate.scope_type === memory.scope_type && candidate.scope_value === memory.scope_value;

  if (sameScope && overlap >= 0.45 && hasNegation(candidate.gist) !== hasNegation(memory.gist)) {
    return {
      memory_id: memory.memory_id,
      conflict_type: 'direct_conflict',
      note: `Candidate appears to contradict approved memory ${memory.memory_id}.`,
      confidence: Math.min(0.95, overlap + 0.25),
    };
  }

  if (candidate.memory_type === memory.memory_type && overlap >= 0.5) {
    return {
      memory_id: memory.memory_id,
      conflict_type: 'scope_overlap',
      note: `Candidate overlaps approved memory ${memory.memory_id}; review scope before approval.`,
      confidence: Math.min(0.9, overlap),
    };
  }

  return null;
}

export function detectConflicts(candidate: MemoryCandidate, memories: MemoryRecord[]): ConflictRef[] {
  return memories
    .map((memory) => conflictFor(candidate, memory))
    .filter((conflict): conflict is ConflictRef => conflict !== null);
}

export function attachConflicts(candidate: MemoryCandidate, memories: MemoryRecord[]): MemoryCandidate {
  const conflicts = detectConflicts(candidate, memories);
  const supersedes = [
    ...new Set([
      ...candidate.supersedes,
      ...conflicts.filter((conflict) => conflict.conflict_type === 'supersedes').map((conflict) => conflict.memory_id),
    ]),
  ];

  return {
    ...candidate,
    supersedes,
    conflicts,
  };
}
