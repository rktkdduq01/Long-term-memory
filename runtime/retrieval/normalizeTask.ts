import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { getRepoRoot } from '../loadPrompt.ts';
import { validateJson } from '../validateJson.ts';
import type { TaskInput } from '../contracts/types.ts';

export function normalizeTask(input: Partial<TaskInput> & { user_request: string }): TaskInput {
  const repo = input.repo ?? 'local';

  return {
    task_id: input.task_id ?? `task_${Date.now()}`,
    user_request: input.user_request,
    repo,
    branch: input.branch,
    scope_type: input.scope_type ?? 'repo',
    scope_value: input.scope_value ?? repo,
    metadata: input.metadata ?? {},
  };
}

export async function assertValidTask(task: unknown, repoRoot = getRepoRoot()): Promise<TaskInput> {
  const result = await validateJson(task, resolve(repoRoot, 'schemas/task.schema.json'));

  if (!result.valid) {
    throw new Error(`Task failed validation:\n${result.errors.join('\n')}`);
  }

  return task as TaskInput;
}

export async function loadTaskFromPath(path: string, repoRoot = getRepoRoot()): Promise<TaskInput> {
  const parsed = JSON.parse(await readFile(resolve(repoRoot, path), 'utf8')) as unknown;
  return assertValidTask(parsed, repoRoot);
}
