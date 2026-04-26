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

const DEFAULT_HARNESS_ROOT = fileURLToPath(new URL('../', import.meta.url));

export function getHarnessRoot(explicitRoot?: string): string {
  const configuredRoot = explicitRoot ?? process.env.MEMORY_HARNESS_ROOT;
  return resolve(configuredRoot?.trim() || DEFAULT_HARNESS_ROOT);
}

export function getRepoRoot(): string {
  return getHarnessRoot();
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

export async function loadPrompt(taskPrompt: string, harnessRoot = getHarnessRoot()): Promise<LoadedPrompt> {
  const basePromptPath = resolve(harnessRoot, 'prompts/base-memory-harness.md');
  const taskPromptPath = resolvePromptPath(taskPrompt, harnessRoot);

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
    const loadedPrompt = await loadPrompt(taskPrompt, getHarnessRoot());
    process.stdout.write(loadedPrompt.combinedPrompt);
  }
}
