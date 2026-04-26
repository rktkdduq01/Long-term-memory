import type { ConflictRef, MemoryCandidate, MemoryRecord } from '../contracts/types.ts';
import { tokenizeText } from './lexicalScore.ts';

function normalizeText(value: string): string {
  return value.toLocaleLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function tokens(value: string): string[] {
  return tokenizeText(value);
}

function commonPrefixLength(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  let index = 0;

  while (index < limit && left[index] === right[index]) {
    index += 1;
  }

  return index;
}

function hasNonAscii(value: string): boolean {
  return /[^\x00-\x7F]/u.test(value);
}

function tokensMatch(left: string, right: string): boolean {
  if (left === right) {
    return true;
  }

  const minimumPrefix = hasNonAscii(left) || hasNonAscii(right) ? 2 : 4;
  return left.length >= minimumPrefix && right.length >= minimumPrefix && commonPrefixLength(left, right) >= minimumPrefix;
}

function overlapScore(left: string, right: string): number {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);

  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return 0;
  }

  const unmatchedRight = new Set(rightTokens);
  let shared = 0;

  for (const leftToken of leftTokens) {
    const rightMatch = [...unmatchedRight].find((rightToken) => tokensMatch(leftToken, rightToken));

    if (rightMatch) {
      unmatchedRight.delete(rightMatch);
      shared += 1;
    }
  }

  return shared / Math.min(leftTokens.length, rightTokens.length);
}

function hasNegation(value: string): boolean {
  const normalized = value.toLocaleLowerCase().normalize('NFKC');
  const negationPatterns = [
    /\b(no|not|never|must\s+not|do\s+not|without)\b/i,
    /하지\s*않는다/u,
    /안\s*한다/u,
    /안함/u,
    /사용하지\s*않는다/u,
    /고려하지\s*않는다/u,
    /금지/u,
    /제외/u,
    /없음/u,
    /하지\s*않음/u,
    /쓰지\s*않는다/u,
  ];

  return negationPatterns.some((pattern) => pattern.test(normalized));
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
  const sameScope = candidate.scope_type === memory.scope_type && candidate.scope_value === memory.scope_value;
  const candidateNegated = hasNegation(candidate.gist);
  const memoryNegated = hasNegation(memory.gist);

  if (sameScope && overlap >= 0.45 && candidateNegated !== memoryNegated) {
    return {
      memory_id: memory.memory_id,
      conflict_type: 'direct_conflict',
      note: `Candidate appears to contradict approved memory ${memory.memory_id}.`,
      confidence: Math.min(0.95, overlap + 0.25),
    };
  }

  if (normalizeText(candidate.gist) === normalizeText(memory.gist) || overlap >= 0.92) {
    return {
      memory_id: memory.memory_id,
      conflict_type: 'duplicate',
      note: `Candidate duplicates approved memory ${memory.memory_id}.`,
      confidence: Math.min(1, overlap || 1),
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
