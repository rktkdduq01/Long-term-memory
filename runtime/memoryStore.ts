import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { getRepoRoot } from './loadPrompt.ts';

export type EvidenceSourceType =
  | 'user_message'
  | 'agent_message'
  | 'tool_result'
  | 'file'
  | 'test_result'
  | 'ci_log'
  | 'repo_config'
  | 'manual_review';

export type TrustLevel = 'trusted' | 'partially_trusted' | 'untrusted';

export type SessionEventType =
  | 'ci_failure'
  | 'user_request'
  | 'assistant_action'
  | 'tool_run'
  | 'validation_result'
  | 'error'
  | 'review_feedback'
  | 'decision'
  | 'other';

export interface TaskInput {
  user_request: string;
  task_metadata?: Record<string, unknown>;
}

export interface EvidenceRef {
  source_type: EvidenceSourceType;
  source_id: string;
  quote_or_summary: string;
  observed_at: string;
  trust_level: TrustLevel;
}

export interface SemanticMemoryRecord {
  memory_id: string;
  type: string;
  gist: string;
  scope_type: string;
  scope_value: string;
  confidence: number;
  importance: number;
  status: string;
  decay_state: string;
  created_at: string;
  updated_at: string;
  last_confirmed_at: string;
  evidence_refs: EvidenceRef[];
  conflicts_with: Array<{
    memory_id: string;
    conflict_status: string;
    note: string;
  }>;
}

export interface EpisodicMemoryRecord {
  episode_id: string;
  event_type: string;
  summary: string;
  status: string;
  scope_type: string;
  scope_value: string;
  created_at: string;
  evidence_refs: EvidenceRef[];
  linked_memories: string[];
}

export interface LoadedMemoryInputs {
  task: TaskInput;
  semanticMemories: SemanticMemoryRecord[];
  episodicMemories: EpisodicMemoryRecord[];
}

export interface SessionEventRecord {
  event_id: string;
  event_type: SessionEventType;
  source_type: EvidenceSourceType;
  source_id: string;
  observed_at: string;
  summary: string;
  related_files?: string[];
  trust_level: TrustLevel;
}

async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function loadJsonLinesFile<T>(path: string): Promise<T[]> {
  const contents = await readFile(path, 'utf8');

  return contents
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as T);
}

export function resolveTaskPath(taskPath: string | undefined, repoRoot = getRepoRoot()): string {
  return resolve(repoRoot, taskPath ?? 'examples/sample-task.json');
}

export function resolveSessionPath(sessionPath: string | undefined, repoRoot = getRepoRoot()): string {
  return resolve(repoRoot, sessionPath ?? 'examples/sample-session-events.json');
}

async function readSemanticMemories(repoRoot: string, useExamples: boolean): Promise<SemanticMemoryRecord[]> {
  if (useExamples) {
    return readJsonFile<SemanticMemoryRecord[]>(resolve(repoRoot, 'examples/sample-semantic-memories.json'));
  }

  try {
    return await readJsonFile<SemanticMemoryRecord[]>(resolve(repoRoot, '.memory/semantic-memories.json'));
  } catch {
    return readJsonFile<SemanticMemoryRecord[]>(resolve(repoRoot, 'examples/sample-semantic-memories.json'));
  }
}

async function readEpisodicMemories(repoRoot: string, useExamples: boolean): Promise<EpisodicMemoryRecord[]> {
  if (useExamples) {
    return readJsonFile<EpisodicMemoryRecord[]>(resolve(repoRoot, 'examples/sample-episodic-memories.json'));
  }

  try {
    return await loadJsonLinesFile<EpisodicMemoryRecord>(resolve(repoRoot, '.memory/episodic-memories.jsonl'));
  } catch {
    return readJsonFile<EpisodicMemoryRecord[]>(resolve(repoRoot, 'examples/sample-episodic-memories.json'));
  }
}

export async function loadMemoryInputs(options?: {
  repoRoot?: string;
  taskPath?: string;
  useExamples?: boolean;
}): Promise<LoadedMemoryInputs> {
  const repoRoot = options?.repoRoot ?? getRepoRoot();
  const useExamples = options?.useExamples ?? false;
  const taskPath = resolveTaskPath(options?.taskPath, repoRoot);

  const [task, semanticMemories, episodicMemories] = await Promise.all([
    readJsonFile<TaskInput>(taskPath),
    readSemanticMemories(repoRoot, useExamples),
    readEpisodicMemories(repoRoot, useExamples),
  ]);

  return {
    task,
    semanticMemories,
    episodicMemories,
  };
}

export async function loadSessionEvents(options?: {
  repoRoot?: string;
  sessionPath?: string;
}): Promise<SessionEventRecord[]> {
  const repoRoot = options?.repoRoot ?? getRepoRoot();
  const sessionPath = resolveSessionPath(options?.sessionPath, repoRoot);

  return readJsonFile<SessionEventRecord[]>(sessionPath);
}

export async function writeBriefingOutput(
  briefing: unknown,
  options?: {
    repoRoot?: string;
    outputPath?: string;
  },
): Promise<string> {
  const repoRoot = options?.repoRoot ?? getRepoRoot();
  const outputPath = resolve(repoRoot, options?.outputPath ?? '.memory/briefing.json');

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(briefing, null, 2)}\n`, 'utf8');

  return outputPath;
}

export async function writeCandidateOutput(
  candidates: unknown,
  options?: {
    repoRoot?: string;
    outputPath?: string;
  },
): Promise<string> {
  const repoRoot = options?.repoRoot ?? getRepoRoot();
  const outputPath = resolve(repoRoot, options?.outputPath ?? '.memory/candidate-memories.json');

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(candidates, null, 2)}\n`, 'utf8');

  return outputPath;
}
