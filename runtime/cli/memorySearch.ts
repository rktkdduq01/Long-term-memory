import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { createMemoryConfig } from '../config/memoryConfig.ts';
import type { MemoryMode, MemoryRecord } from '../contracts/types.ts';
import { readAllMemories } from '../store/memoryStore.ts';
import { sampleMemories } from '../reference/sampleBriefing.ts';
import { memoryLexicalScore } from '../retrieval/lexicalScore.ts';
import { parseCliArgs } from './parseArgs.ts';

export interface MemorySearchOptions {
  harnessRoot?: string;
  projectRoot?: string;
  repoRoot?: string;
  memoryDir?: string;
  mode?: MemoryMode;
  repoScope?: string;
  query: string;
}

export async function searchMemory(options: MemorySearchOptions): Promise<Array<MemoryRecord & { match_score: number }>> {
  const mode = options.mode ?? 'strict';
  const config = createMemoryConfig({
    harnessRoot: options.harnessRoot,
    projectRoot: options.projectRoot,
    repoRoot: options.repoRoot,
    memoryDir: options.memoryDir,
    mode,
    repoScope: options.repoScope,
  });
  const memories = mode === 'demo' ? sampleMemories : await readAllMemories(config);

  return memories
    .filter((memory) => memory.status === 'active')
    .map((memory) => ({
      ...memory,
      match_score: memoryLexicalScore(options.query, memory),
    }))
    .filter((memory) => memory.match_score > 0)
    .sort((left, right) => right.match_score - left.match_score || right.importance - left.importance);
}

export interface MemorySearchCliArgs {
  demo: boolean;
  query: string;
  memoryDir?: string;
  projectRoot?: string;
  harnessRoot?: string;
  repoScope?: string;
}

type MemorySearchCliKey = keyof MemorySearchCliArgs;

export function parseMemorySearchArgs(argv: string[]): MemorySearchCliArgs {
  const parsed = parseCliArgs<MemorySearchCliKey>(argv, {
    booleanFlags: [{ flag: '--demo', key: 'demo' }],
    stringOptions: [
      { flag: '--query', key: 'query' },
      { flag: '--memory-dir', key: 'memoryDir' },
      { flag: '--project-root', key: 'projectRoot' },
      { flag: '--harness-root', key: 'harnessRoot' },
      { flag: '--repo', key: 'repoScope' },
      { flag: '--repo-scope', key: 'repoScope' },
    ],
    positional: {
      key: 'query',
      label: 'memory:search query',
    },
    required: [
      {
        key: 'query',
        message: 'memory:search requires --query <text>.',
      },
    ],
  });

  return {
    demo: parsed.demo === true,
    query: parsed.query as string,
    memoryDir: parsed.memoryDir as string | undefined,
    projectRoot: parsed.projectRoot as string | undefined,
    harnessRoot: parsed.harnessRoot as string | undefined,
    repoScope: parsed.repoScope as string | undefined,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseMemorySearchArgs(process.argv.slice(2));

  const results = await searchMemory({
    mode: args.demo ? 'demo' : 'strict',
    query: args.query,
    harnessRoot: args.harnessRoot,
    projectRoot: args.projectRoot,
    memoryDir: args.memoryDir,
    repoScope: args.repoScope,
  });
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
}
