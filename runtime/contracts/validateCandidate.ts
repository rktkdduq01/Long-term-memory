import { resolve } from 'node:path';

import { getRepoRoot } from '../loadPrompt.ts';
import { validateJson } from '../validateJson.ts';
import type { MemoryCandidate } from './types.ts';
import { memoryKindTypeWarning } from './memorySemantics.ts';

export async function validateCandidate(candidate: unknown, repoRoot = getRepoRoot()): Promise<string[]> {
  const result = await validateJson(candidate, resolve(repoRoot, 'schemas/memory-candidate.schema.json'));
  return result.errors;
}

export async function assertValidCandidate(candidate: unknown, repoRoot = getRepoRoot()): Promise<MemoryCandidate> {
  const errors = await validateCandidate(candidate, repoRoot);

  if (errors.length > 0) {
    throw new Error(`Memory candidate failed validation:\n${errors.join('\n')}`);
  }

  return candidate as MemoryCandidate;
}

export function validateCandidateSemantics(candidate: MemoryCandidate): string[] {
  const warning = memoryKindTypeWarning(`candidate ${candidate.candidate_id}`, candidate.target_kind, candidate.memory_type);
  return warning ? [warning] : [];
}
