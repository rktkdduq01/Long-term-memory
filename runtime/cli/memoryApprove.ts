import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { createMemoryConfig } from '../config/memoryConfig.ts';
import { approveCandidate } from '../store/candidateStore.ts';
import { parseCliArgs } from './parseArgs.ts';

export interface MemoryApproveOptions {
  harnessRoot?: string;
  projectRoot?: string;
  repoRoot?: string;
  memoryDir?: string;
  candidateId: string;
  reason: string;
  now?: Date;
}

export async function approveMemoryCandidate(options: MemoryApproveOptions) {
  const config = createMemoryConfig({
    harnessRoot: options.harnessRoot,
    projectRoot: options.projectRoot,
    repoRoot: options.repoRoot,
    memoryDir: options.memoryDir,
    mode: 'strict',
  });

  return approveCandidate(config, {
    candidateId: options.candidateId,
    reason: options.reason,
    now: options.now,
  });
}

export interface MemoryApproveCliArgs {
  candidateId: string;
  reason: string;
  memoryDir?: string;
  projectRoot?: string;
  harnessRoot?: string;
}

type MemoryApproveCliKey = keyof MemoryApproveCliArgs;

export function parseMemoryApproveArgs(argv: string[]): MemoryApproveCliArgs {
  const parsed = parseCliArgs<MemoryApproveCliKey>(argv, {
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
        message: 'memory:approve requires --candidate <candidate_id>.',
      },
      {
        key: 'reason',
        message: 'memory:approve requires --reason <reason>; reason must be non-empty.',
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
  const args = parseMemoryApproveArgs(process.argv.slice(2));

  const result = await approveMemoryCandidate({
    candidateId: args.candidateId,
    reason: args.reason,
    harnessRoot: args.harnessRoot,
    projectRoot: args.projectRoot,
    memoryDir: args.memoryDir,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
