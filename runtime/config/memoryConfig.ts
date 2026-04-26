import { resolve } from 'node:path';

import { getRepoRoot } from '../loadPrompt.ts';
import { MEMORY_STORE_FILES } from '../contracts/constants.ts';
import type { MemoryKind, MemoryMode } from '../contracts/types.ts';

export interface MemoryConfig {
  repoRoot: string;
  mode: MemoryMode;
  memoryDir: string;
  stores: {
    memories: Record<MemoryKind, string>;
    candidates: {
      pending: string;
      approved: string;
      rejected: string;
    };
    sessions: {
      latest: string;
    };
    audit: string;
  };
}

export interface MemoryConfigOptions {
  repoRoot?: string;
  memoryDir?: string;
  mode?: MemoryMode;
}

function resolveStore(repoRoot: string, memoryDir: string | undefined, relativePath: string): string {
  if (!memoryDir) {
    return resolve(repoRoot, relativePath);
  }

  return resolve(repoRoot, memoryDir, relativePath.replace(/^\.memory\//, ''));
}

export function createMemoryConfig(options?: MemoryConfigOptions): MemoryConfig {
  const repoRoot = options?.repoRoot ?? getRepoRoot();
  const mode = options?.mode ?? 'strict';
  const memoryDir = options?.memoryDir ? resolve(repoRoot, options.memoryDir) : resolve(repoRoot, '.memory');

  return {
    repoRoot,
    mode,
    memoryDir,
    stores: {
      memories: {
        semantic: resolveStore(repoRoot, options?.memoryDir, MEMORY_STORE_FILES.semantic),
        episodic: resolveStore(repoRoot, options?.memoryDir, MEMORY_STORE_FILES.episodic),
        procedural: resolveStore(repoRoot, options?.memoryDir, MEMORY_STORE_FILES.procedural),
        project: resolveStore(repoRoot, options?.memoryDir, MEMORY_STORE_FILES.project),
      },
      candidates: {
        pending: resolveStore(repoRoot, options?.memoryDir, MEMORY_STORE_FILES.pendingCandidates),
        approved: resolveStore(repoRoot, options?.memoryDir, MEMORY_STORE_FILES.approvedCandidates),
        rejected: resolveStore(repoRoot, options?.memoryDir, MEMORY_STORE_FILES.rejectedCandidates),
      },
      sessions: {
        latest: resolveStore(repoRoot, options?.memoryDir, MEMORY_STORE_FILES.latestSession),
      },
      audit: resolveStore(repoRoot, options?.memoryDir, MEMORY_STORE_FILES.audit),
    },
  };
}
