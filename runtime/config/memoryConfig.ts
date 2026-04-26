import { resolve } from 'node:path';

import { getHarnessRoot } from '../loadPrompt.ts';
import { MEMORY_STORE_FILES } from '../contracts/constants.ts';
import type { MemoryKind, MemoryMode } from '../contracts/types.ts';

export interface MemoryConfig {
  harnessRoot: string;
  projectRoot: string;
  repoRoot: string;
  mode: MemoryMode;
  memoryDir: string;
  repoScope: string;
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
  harnessRoot?: string;
  projectRoot?: string;
  repoRoot?: string;
  memoryDir?: string;
  mode?: MemoryMode;
  repoScope?: string;
}

function resolveStore(memoryDir: string, relativePath: string): string {
  return resolve(memoryDir, relativePath.replace(/^\.memory\//, ''));
}

function normalizeConfiguredRepoScope(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : 'local';
}

function configuredRoot(explicit: string | undefined, environment: string | undefined, fallback: string): string {
  return resolve(explicit?.trim() || environment?.trim() || fallback);
}

export function createMemoryConfig(options?: MemoryConfigOptions): MemoryConfig {
  const harnessRoot = configuredRoot(options?.harnessRoot ?? options?.repoRoot, process.env.MEMORY_HARNESS_ROOT, getHarnessRoot());
  const projectRoot = configuredRoot(options?.projectRoot, process.env.MEMORY_PROJECT_ROOT, harnessRoot);
  const repoRoot = harnessRoot;
  const mode = options?.mode ?? 'strict';
  const memoryDir = options?.memoryDir ? resolve(projectRoot, options.memoryDir) : resolve(projectRoot, '.memory');
  const configuredRepoScope = options?.repoScope ?? process.env.MEMORY_REPO_SCOPE;

  return {
    harnessRoot,
    projectRoot,
    repoRoot,
    mode,
    memoryDir,
    repoScope: normalizeConfiguredRepoScope(configuredRepoScope),
    stores: {
      memories: {
        semantic: resolveStore(memoryDir, MEMORY_STORE_FILES.semantic),
        episodic: resolveStore(memoryDir, MEMORY_STORE_FILES.episodic),
        procedural: resolveStore(memoryDir, MEMORY_STORE_FILES.procedural),
        project: resolveStore(memoryDir, MEMORY_STORE_FILES.project),
      },
      candidates: {
        pending: resolveStore(memoryDir, MEMORY_STORE_FILES.pendingCandidates),
        approved: resolveStore(memoryDir, MEMORY_STORE_FILES.approvedCandidates),
        rejected: resolveStore(memoryDir, MEMORY_STORE_FILES.rejectedCandidates),
      },
      sessions: {
        latest: resolveStore(memoryDir, MEMORY_STORE_FILES.latestSession),
      },
      audit: resolveStore(memoryDir, MEMORY_STORE_FILES.audit),
    },
  };
}
