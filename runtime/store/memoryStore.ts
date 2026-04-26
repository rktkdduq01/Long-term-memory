import type { MemoryConfig } from '../config/memoryConfig.ts';
import { MEMORY_KINDS } from '../contracts/constants.ts';
import type { MemoryKind, MemoryRecord } from '../contracts/types.ts';
import { assertValidMemory } from '../contracts/validateMemory.ts';
import { appendJsonl, readJsonl, writeJsonl } from './jsonlStore.ts';

export function memoryPathForKind(config: MemoryConfig, kind: MemoryKind): string {
  return config.stores.memories[kind];
}

export async function readMemories(config: MemoryConfig, kind: MemoryKind): Promise<MemoryRecord[]> {
  const records = await readJsonl<unknown>(memoryPathForKind(config, kind));
  const memories: MemoryRecord[] = [];

  for (const record of records) {
    memories.push(await assertValidMemory(record, config.repoRoot));
  }

  return memories;
}

export async function readAllMemories(config: MemoryConfig): Promise<MemoryRecord[]> {
  const groups = await Promise.all(MEMORY_KINDS.map((kind) => readMemories(config, kind)));
  return groups.flat();
}

export async function appendMemory(config: MemoryConfig, memory: MemoryRecord): Promise<void> {
  await assertValidMemory(memory, config.repoRoot);
  await appendJsonl(memoryPathForKind(config, memory.kind), memory);
}

export async function writeMemories(config: MemoryConfig, kind: MemoryKind, memories: MemoryRecord[]): Promise<void> {
  for (const memory of memories) {
    await assertValidMemory(memory, config.repoRoot);
  }

  await writeJsonl(memoryPathForKind(config, kind), memories);
}

export async function markMemoriesSuperseded(
  config: MemoryConfig,
  memoryIds: string[],
  replacementMemoryId: string,
  updatedAt: string,
): Promise<MemoryRecord[]> {
  if (memoryIds.length === 0) {
    return [];
  }

  const superseded: MemoryRecord[] = [];
  const targetIds = new Set(memoryIds);

  for (const kind of MEMORY_KINDS) {
    const memories = await readMemories(config, kind);
    let changed = false;

    const updated = memories.map((memory) => {
      if (!targetIds.has(memory.memory_id)) {
        return memory;
      }

      changed = true;
      const nextMemory: MemoryRecord = {
        ...memory,
        status: 'superseded',
        superseded_by: replacementMemoryId,
        updated_at: updatedAt,
      };
      superseded.push(nextMemory);
      return nextMemory;
    });

    if (changed) {
      await writeMemories(config, kind, updated);
    }
  }

  return superseded;
}
