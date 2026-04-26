import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { createMemoryConfig } from '../config/memoryConfig.ts';
import { BRIEFING_MAX_ITEMS, BRIEFING_MAX_WORDS } from '../contracts/constants.ts';
import type { Briefing, BriefingItem, MemoryMode, MemoryRecord, ScopeType, TaskInput } from '../contracts/types.ts';
import { assertValidBriefing } from '../contracts/validateBriefing.ts';
import { readAllMemories } from '../store/memoryStore.ts';
import { assertValidTask, loadTaskFromPath, normalizeTask } from '../retrieval/normalizeTask.ts';
import { type RankedMemory, rankMemories } from '../retrieval/rankMemories.ts';
import { sampleMemories, sampleTask } from '../reference/sampleBriefing.ts';
import { parseCliArgs } from './parseArgs.ts';

export interface BuildMemoryBriefingOptions {
  harnessRoot?: string;
  projectRoot?: string;
  repoRoot?: string;
  memoryDir?: string;
  mode?: MemoryMode;
  taskPath?: string;
  request?: string;
  repo?: string;
  branch?: string;
  scopeType?: ScopeType;
  scopeValue?: string;
  repoScope?: string;
  now?: Date;
}

const scopeTypes = new Set<ScopeType>(['global_user', 'repo', 'branch', 'directory', 'file', 'task_type', 'session']);

function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function trimToWordLimit(value: string, maxWords: number): string {
  const words = value.trim().split(/\s+/).filter(Boolean);

  if (words.length <= maxWords) {
    return value.trim();
  }

  return words.slice(0, maxWords).join(' ');
}

function isScopeType(value: string): value is ScopeType {
  return scopeTypes.has(value as ScopeType);
}

export async function resolveBriefingTask(
  options: BuildMemoryBriefingOptions,
  mode: MemoryMode,
  configuredRepoScope = 'local',
  harnessRoot?: string,
  projectRoot?: string,
): Promise<TaskInput> {
  if (options.taskPath) {
    const schemaRoot = harnessRoot ?? options.harnessRoot ?? options.repoRoot;
    const taskRoot = projectRoot ?? options.projectRoot ?? schemaRoot;
    return loadTaskFromPath(options.taskPath, schemaRoot, taskRoot);
  }

  if (options.request) {
    const repo = options.repo ?? configuredRepoScope;
    const task = normalizeTask({
      user_request: options.request,
      repo,
      branch: options.branch,
      scope_type: options.scopeType ?? 'repo',
      scope_value: options.scopeValue ?? repo,
    });

    const schemaRoot = harnessRoot ?? options.harnessRoot ?? options.repoRoot;
    return schemaRoot ? assertValidTask(task, schemaRoot) : assertValidTask(task);
  }

  if (mode === 'demo') {
    return sampleTask;
  }

  throw new Error('Strict mode requires --task <path> or --request <text>.');
}

function buildRenderedBriefing(items: BriefingItem[], task: TaskInput): string {
  if (items.length === 0) {
    return `No approved local memory matched task ${task.task_id}.`;
  }

  const parts = items.map((item) => {
    const label = item.category.replaceAll('_', ' ');
    return `${label}: ${item.gist}`;
  });

  return trimToWordLimit(parts.join(' '), BRIEFING_MAX_WORDS);
}

function buildWarnings(renderedBriefing: string, ranked: RankedMemory[]): string[] {
  const warnings: string[] = [];

  if (countWords(renderedBriefing) > BRIEFING_MAX_WORDS) {
    warnings.push('Briefing was trimmed to the shared word limit.');
  }

  const conflictIds = [
    ...new Set(
      ranked
        .filter((entry) => entry.category === 'conflict' || entry.memory.conflicts.length > 0)
        .flatMap((entry) => [
          entry.memory.memory_id,
          ...entry.memory.conflicts.map((conflict) => conflict.memory_id),
        ]),
    ),
  ];

  if (conflictIds.length > 0) {
    warnings.push(`Selected memories include unresolved conflicts: ${conflictIds.join(', ')}`);
  }

  const uncertainIds = ranked
    .filter((entry) => entry.category === 'uncertainty')
    .map((entry) => entry.memory.memory_id);

  if (uncertainIds.length > 0) {
    warnings.push(`Selected memories include uncertain or low-confidence items: ${uncertainIds.join(', ')}`);
  }

  return warnings;
}

export async function buildMemoryBriefing(options?: BuildMemoryBriefingOptions): Promise<Briefing> {
  const mode = options?.mode ?? 'strict';
  const config = createMemoryConfig({
    harnessRoot: options?.harnessRoot,
    projectRoot: options?.projectRoot,
    repoRoot: options?.repoRoot,
    memoryDir: options?.memoryDir,
    mode,
    repoScope: options?.repoScope,
  });
  const task = await resolveBriefingTask(options ?? {}, mode, config.repoScope, config.harnessRoot, config.projectRoot);
  const memories: MemoryRecord[] = mode === 'demo' ? sampleMemories : await readAllMemories(config);
  const ranked = rankMemories(task, memories, BRIEFING_MAX_ITEMS);
  const items: BriefingItem[] = ranked.map((entry) => ({
    memory_id: entry.memory.memory_id,
    kind: entry.memory.kind,
    category: entry.category,
    gist: entry.memory.gist,
    relevance: entry.relevance,
    confidence: entry.memory.confidence,
    evidence_refs: entry.memory.evidence_refs,
  }));
  const rendered_briefing = buildRenderedBriefing(items, task);
  const warnings = buildWarnings(rendered_briefing, ranked);
  const briefing: Briefing = {
    task_id: task.task_id,
    generated_at: (options?.now ?? new Date()).toISOString(),
    mode,
    max_words: BRIEFING_MAX_WORDS,
    max_items: BRIEFING_MAX_ITEMS,
    items,
    rendered_briefing,
    warnings,
  };

  return assertValidBriefing(briefing, config.repoRoot);
}

export interface MemoryBriefingCliArgs {
  demo: boolean;
  taskPath?: string;
  request?: string;
  memoryDir?: string;
  projectRoot?: string;
  harnessRoot?: string;
  repo?: string;
  branch?: string;
  scopeType?: ScopeType;
  scopeValue?: string;
}

type MemoryBriefingCliKey = keyof Omit<MemoryBriefingCliArgs, 'scopeType'> | 'scopeType';

export function parseMemoryBriefingArgs(argv: string[]): MemoryBriefingCliArgs {
  const parsed = parseCliArgs<MemoryBriefingCliKey>(argv, {
    booleanFlags: [{ flag: '--demo', key: 'demo' }],
    stringOptions: [
      { flag: '--task', key: 'taskPath' },
      { flag: '--request', key: 'request' },
      { flag: '--memory-dir', key: 'memoryDir' },
      { flag: '--project-root', key: 'projectRoot' },
      { flag: '--harness-root', key: 'harnessRoot' },
      { flag: '--repo', key: 'repo' },
      { flag: '--branch', key: 'branch' },
      { flag: '--scope-type', key: 'scopeType' },
      { flag: '--scope-value', key: 'scopeValue' },
    ],
  });
  const scopeType = parsed.scopeType;

  if (typeof scopeType === 'string' && !isScopeType(scopeType)) {
    throw new Error(`--scope-type must be one of: ${Array.from(scopeTypes).join(', ')}.`);
  }

  return {
    demo: parsed.demo === true,
    taskPath: parsed.taskPath as string | undefined,
    request: parsed.request as string | undefined,
    memoryDir: parsed.memoryDir as string | undefined,
    projectRoot: parsed.projectRoot as string | undefined,
    harnessRoot: parsed.harnessRoot as string | undefined,
    repo: parsed.repo as string | undefined,
    branch: parsed.branch as string | undefined,
    scopeType: scopeType as ScopeType | undefined,
    scopeValue: parsed.scopeValue as string | undefined,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseMemoryBriefingArgs(process.argv.slice(2));
  const briefing = await buildMemoryBriefing({
    mode: args.demo ? 'demo' : 'strict',
    taskPath: args.taskPath,
    request: args.request,
    harnessRoot: args.harnessRoot,
    projectRoot: args.projectRoot,
    memoryDir: args.memoryDir,
    repo: args.repo,
    branch: args.branch,
    scopeType: args.scopeType,
    scopeValue: args.scopeValue,
  });
  process.stdout.write(`${JSON.stringify(briefing, null, 2)}\n`);
}
