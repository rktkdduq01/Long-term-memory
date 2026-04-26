import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { createMemoryConfig } from '../config/memoryConfig.ts';
import { rejectCandidate } from '../store/candidateStore.ts';
import { parseCliArgs } from './parseArgs.ts';

export interface MemoryRejectOptions {
  harnessRoot?: string;
  projectRoot?: string;
  repoRoot?: string;
  memoryDir?: string;
  candidateId: string;
  reason: string;
  now?: Date;
}

export async function rejectMemoryCandidate(options: MemoryRejectOptions) {
  const config = createMemoryConfig({
    harnessRoot: options.harnessRoot,
    projectRoot: options.projectRoot,
    repoRoot: options.repoRoot,
    memoryDir: options.memoryDir,
    mode: 'strict',
  });

  return rejectCandidate(config, {
    candidateId: options.candidateId,
    reason: options.reason,
    now: options.now,
  });
}

export interface MemoryRejectCliArgs {
  candidateId: string;
  reason: string;
  memoryDir?: string;
  projectRoot?: string;
  harnessRoot?: string;
}

type MemoryRejectCliKey = keyof MemoryRejectCliArgs;

export function parseMemoryRejectArgs(argv: string[]): MemoryRejectCliArgs {
  const parsed = parseCliArgs<MemoryRejectCliKey>(argv, {
    stringOptions: [
      { flag: '--candidate', key: 'candidateId' },
      { flag: '--reason', key: 'reason' },
      { flag: '--memory-dir', key: 'memoryDir' },
      { flag: '--project-root', key: 'projectRoot' },
      { flag: '--harness-root', key: 'harnessRoot' },
    ],
    required: [
      {
        key: 'candidateId',
        message: 'memory:reject requires --candidate <candidate_id>.',
      },
      {
        key: 'reason',
        message: 'memory:reject requires --reason <reason>; reason must be non-empty.',
      },
    ],
  });

  return {
    candidateId: parsed.candidateId as string,
    reason: parsed.reason as string,
    memoryDir: parsed.memoryDir as string | undefined,
    projectRoot: parsed.projectRoot as string | undefined,
    harnessRoot: parsed.harnessRoot as string | undefined,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseMemoryRejectArgs(process.argv.slice(2));

  const result = await rejectMemoryCandidate({
    candidateId: args.candidateId,
    reason: args.reason,
    harnessRoot: args.harnessRoot,
    projectRoot: args.projectRoot,
    memoryDir: args.memoryDir,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
