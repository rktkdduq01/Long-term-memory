import { resolve } from 'node:path';

import { getRepoRoot } from '../loadPrompt.ts';
import { validateJson } from '../validateJson.ts';
import type { MemoryRecord } from './types.ts';
import { memoryKindTypeWarning } from './memorySemantics.ts';

export async function validateMemory(memory: unknown, repoRoot = getRepoRoot()): Promise<string[]> {
  const result = await validateJson(memory, resolve(repoRoot, 'schemas/memory.schema.json'));
  return result.errors;
}

export async function assertValidMemory(memory: unknown, repoRoot = getRepoRoot()): Promise<MemoryRecord> {
  const errors = await validateMemory(memory, repoRoot);

  if (errors.length > 0) {
    throw new Error(`Memory failed validation:\n${errors.join('\n')}`);
  }

  return memory as MemoryRecord;
}

export function validateMemorySemantics(memory: MemoryRecord): string[] {
  const warning = memoryKindTypeWarning(`memory ${memory.memory_id}`, memory.kind, memory.memory_type);
  return warning ? [warning] : [];
}
