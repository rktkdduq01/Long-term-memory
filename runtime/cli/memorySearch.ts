import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { createMemoryConfig } from '../config/memoryConfig.ts';
import type { MemoryMode, MemoryRecord } from '../contracts/types.ts';
import { readAllMemories } from '../store/memoryStore.ts';
import { sampleMemories } from '../reference/sampleBriefing.ts';

export interface MemorySearchOptions {
  repoRoot?: string;
  memoryDir?: string;
  mode?: MemoryMode;
  query: string;
}

function normalize(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 1);
}

function matchScore(memory: MemoryRecord, query: string): number {
  const queryTokens = normalize(query);
  const memoryTokens = new Set(normalize(`${memory.gist} ${memory.scope_value} ${memory.memory_type}`));

  if (queryTokens.length === 0) {
    return 0;
  }

  return queryTokens.filter((token) => memoryTokens.has(token)).length / queryTokens.length;
}

export async function searchMemory(options: MemorySearchOptions): Promise<Array<MemoryRecord & { match_score: number }>> {
  const mode = options.mode ?? 'strict';
  const config = createMemoryConfig({
    repoRoot: options.repoRoot,
    memoryDir: options.memoryDir,
    mode,
  });
  const memories = mode === 'demo' ? sampleMemories : await readAllMemories(config);

  return memories
    .filter((memory) => memory.status === 'active')
    .map((memory) => ({
      ...memory,
      match_score: matchScore(memory, options.query),
    }))
    .filter((memory) => memory.match_score > 0)
    .sort((left, right) => right.match_score - left.match_score || right.importance - left.importance);
}

function parseArgs(argv: string[]) {
  const parsed: {
    demo: boolean;
    query?: string;
    memoryDir?: string;
  } = {
    demo: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--demo') {
      parsed.demo = true;
    } else if (argument === '--query') {
      parsed.query = argv[index + 1];
      index += 1;
    } else if (argument === '--memory-dir') {
      parsed.memoryDir = argv[index + 1];
      index += 1;
    } else if (!parsed.query) {
      parsed.query = argument;
    }
  }

  return parsed;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));

  if (!args.query) {
    throw new Error('memory:search requires --query <text>.');
  }

  const results = await searchMemory({
    mode: args.demo ? 'demo' : 'strict',
    query: args.query,
    memoryDir: args.memoryDir,
  });
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
}
