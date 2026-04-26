import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { createMemoryConfig } from '../config/memoryConfig.ts';
import { BRIEFING_MAX_ITEMS, BRIEFING_MAX_WORDS } from '../contracts/constants.ts';
import type { Briefing, BriefingItem, MemoryMode, MemoryRecord, TaskInput } from '../contracts/types.ts';
import { assertValidBriefing } from '../contracts/validateBriefing.ts';
import { readAllMemories } from '../store/memoryStore.ts';
import { loadTaskFromPath, normalizeTask } from '../retrieval/normalizeTask.ts';
import { rankMemories } from '../retrieval/rankMemories.ts';
import { sampleMemories, sampleTask } from '../reference/sampleBriefing.ts';

export interface BuildMemoryBriefingOptions {
  repoRoot?: string;
  memoryDir?: string;
  mode?: MemoryMode;
  taskPath?: string;
  request?: string;
  now?: Date;
}

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

async function loadTask(options: BuildMemoryBriefingOptions, mode: MemoryMode): Promise<TaskInput> {
  if (options.taskPath) {
    return loadTaskFromPath(options.taskPath, options.repoRoot);
  }

  if (options.request) {
    return normalizeTask({
      user_request: options.request,
      repo: 'local',
      scope_type: 'repo',
      scope_value: 'local',
    });
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

export async function buildMemoryBriefing(options?: BuildMemoryBriefingOptions): Promise<Briefing> {
  const mode = options?.mode ?? 'strict';
  const config = createMemoryConfig({
    repoRoot: options?.repoRoot,
    memoryDir: options?.memoryDir,
    mode,
  });
  const task = await loadTask(options ?? {}, mode);
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
  const warnings = countWords(rendered_briefing) > BRIEFING_MAX_WORDS ? ['Briefing was trimmed to the shared word limit.'] : [];
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

function parseArgs(argv: string[]) {
  const parsed: {
    demo: boolean;
    taskPath?: string;
    request?: string;
    memoryDir?: string;
  } = {
    demo: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--demo') {
      parsed.demo = true;
    } else if (argument === '--task') {
      parsed.taskPath = argv[index + 1];
      index += 1;
    } else if (argument === '--request') {
      parsed.request = argv[index + 1];
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
  const briefing = await buildMemoryBriefing({
    mode: args.demo ? 'demo' : 'strict',
    taskPath: args.taskPath,
    request: args.request,
    memoryDir: args.memoryDir,
  });
  process.stdout.write(`${JSON.stringify(briefing, null, 2)}\n`);
}
