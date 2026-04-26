import type { MemoryRecord, TaskInput } from '../contracts/types.ts';

export type LexicalInput = string | TaskInput;

export function tokenizeText(value: string): string[] {
  return [
    ...new Set(
      value
        .toLocaleLowerCase()
        .normalize('NFKC')
        .split(/[^\p{L}\p{N}]+/gu)
        .filter((token) => token.length > 0),
    ),
  ];
}

function commonPrefixLength(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  let index = 0;

  while (index < limit && left[index] === right[index]) {
    index += 1;
  }

  return index;
}

function hasNonAscii(value: string): boolean {
  return /[^\x00-\x7F]/u.test(value);
}

function tokensMatch(left: string, right: string): boolean {
  if (left === right) {
    return true;
  }

  const minimumPrefix = hasNonAscii(left) || hasNonAscii(right) ? 2 : 4;
  return left.length >= minimumPrefix && right.length >= minimumPrefix && commonPrefixLength(left, right) >= minimumPrefix;
}

function uniqueTokens(parts: string[]): string[] {
  return [...new Set(parts.flatMap((part) => tokenizeText(part)))];
}

function taskTextParts(task: TaskInput): string[] {
  const taskType = typeof task.metadata.task_type === 'string' ? task.metadata.task_type : '';
  return [task.user_request, task.repo, task.scope_value, taskType].filter(Boolean);
}

function memoryTextParts(memory: MemoryRecord): string[] {
  return [
    memory.gist,
    memory.scope_value,
    memory.memory_type,
    ...memory.evidence_refs.map((evidence) => evidence.quote_or_summary),
  ].filter(Boolean);
}

export function lexicalOverlapScore(query: string, target: string): number {
  const queryTokens = tokenizeText(query);
  const targetTokens = new Set(tokenizeText(target));

  if (queryTokens.length === 0 || targetTokens.size === 0) {
    return 0;
  }

  const unmatchedTarget = new Set(targetTokens);
  let shared = 0;

  for (const queryToken of queryTokens) {
    const targetMatch = [...unmatchedTarget].find((targetToken) => tokensMatch(queryToken, targetToken));

    if (targetMatch) {
      unmatchedTarget.delete(targetMatch);
      shared += 1;
    }
  }

  return shared / queryTokens.length;
}

function lexicalScore(queryParts: string[], targetParts: string[]): number {
  return lexicalOverlapScore(queryParts.join(' '), targetParts.join(' '));
}

export function memoryLexicalScore(input: LexicalInput, memory: MemoryRecord): number {
  const queryParts = typeof input === 'string' ? [input] : taskTextParts(input);
  return lexicalScore(queryParts, memoryTextParts(memory));
}

export function scoreTaskMemoryLexical(task: TaskInput, memory: MemoryRecord): number {
  return memoryLexicalScore(task, memory);
}

export function scoreQueryMemoryLexical(query: string, memory: MemoryRecord): number {
  return memoryLexicalScore(query, memory);
}
