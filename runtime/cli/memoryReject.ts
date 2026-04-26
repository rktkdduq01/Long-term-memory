import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { createMemoryConfig } from '../config/memoryConfig.ts';
import { rejectCandidate } from '../store/candidateStore.ts';

export interface MemoryRejectOptions {
  repoRoot?: string;
  memoryDir?: string;
  candidateId: string;
  reason: string;
  now?: Date;
}

export async function rejectMemoryCandidate(options: MemoryRejectOptions) {
  const config = createMemoryConfig({
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

function parseArgs(argv: string[]) {
  const parsed: {
    candidateId?: string;
    reason?: string;
    memoryDir?: string;
  } = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--candidate') {
      parsed.candidateId = argv[index + 1];
      index += 1;
    } else if (argument === '--reason') {
      parsed.reason = argv[index + 1];
      index += 1;
    } else if (argument === '--memory-dir') {
      parsed.memoryDir = argv[index + 1];
      index += 1;
    }
  }

  return parsed;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));

  if (!args.candidateId) {
    throw new Error('memory:reject requires --candidate <candidate_id>.');
  }

  const result = await rejectMemoryCandidate({
    candidateId: args.candidateId,
    reason: args.reason ?? 'User explicitly rejected this memory candidate.',
    memoryDir: args.memoryDir,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
