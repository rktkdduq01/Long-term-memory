import { readFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface LoadedPrompt {
  basePromptPath: string;
  taskPromptPath: string;
  basePrompt: string;
  taskPrompt: string;
  combinedPrompt: string;
}

const DEFAULT_REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));

export function getRepoRoot(): string {
  return DEFAULT_REPO_ROOT;
}

function normalizeTaskPromptName(taskPrompt: string): string {
  if (!extname(taskPrompt)) {
    return `${taskPrompt}.md`;
  }

  return taskPrompt;
}

function resolvePromptPath(taskPrompt: string, repoRoot: string): string {
  const promptsDir = resolve(repoRoot, 'prompts');
  const normalizedTaskPrompt = normalizeTaskPromptName(taskPrompt);
  const candidatePath = normalizedTaskPrompt.startsWith('prompts/')
    ? resolve(repoRoot, normalizedTaskPrompt)
    : resolve(promptsDir, normalizedTaskPrompt);
  const relativePath = relative(promptsDir, candidatePath);

  if (relativePath.startsWith('..')) {
    throw new Error(`Prompt must resolve inside prompts/: ${taskPrompt}`);
  }

  return candidatePath;
}

export async function loadPrompt(taskPrompt: string, repoRoot = getRepoRoot()): Promise<LoadedPrompt> {
  const basePromptPath = resolve(repoRoot, 'prompts/base-memory-harness.md');
  const taskPromptPath = resolvePromptPath(taskPrompt, repoRoot);

  if (taskPromptPath === basePromptPath) {
    throw new Error('Task prompt must not be prompts/base-memory-harness.md.');
  }

  const [basePrompt, taskPromptContent] = await Promise.all([
    readFile(basePromptPath, 'utf8'),
    readFile(taskPromptPath, 'utf8'),
  ]);

  return {
    basePromptPath,
    taskPromptPath,
    basePrompt,
    taskPrompt: taskPromptContent,
    combinedPrompt: `${basePrompt.trimEnd()}\n\n${taskPromptContent}`,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const taskPrompt = process.argv[2];

  if (!taskPrompt) {
    console.error('Usage: node --experimental-strip-types runtime/loadPrompt.ts <task-prompt>');
    process.exitCode = 1;
  } else {
    const loadedPrompt = await loadPrompt(taskPrompt, DEFAULT_REPO_ROOT);
    process.stdout.write(loadedPrompt.combinedPrompt);
  }
}
