import { resolve } from 'node:path';

import { validateJson } from './validateJson.ts';

export interface ValidateMemoryOutputOptions {
  allowMarkdownFences?: boolean;
}

export interface ValidMemoryOutputResult<T> {
  valid: true;
  parsed: T;
  errors: [];
}

export interface InvalidMemoryOutputResult {
  valid: false;
  errors: string[];
}

export type MemoryOutputValidationResult<T = unknown> = ValidMemoryOutputResult<T> | InvalidMemoryOutputResult;

function extractFencedJsonBlock(rawOutput: string): string | null {
  const trimmed = rawOutput.trim();
  const match = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i);

  return match ? match[1].trim() : null;
}

function containsMarkdownFence(rawOutput: string): boolean {
  return /```/.test(rawOutput);
}

export async function validateMemoryOutput<T = unknown>(
  rawOutput: string,
  schemaPath: string,
  options?: ValidateMemoryOutputOptions,
): Promise<MemoryOutputValidationResult<T>> {
  const allowMarkdownFences = options?.allowMarkdownFences ?? false;
  const trimmedOutput = rawOutput.trim();

  if (trimmedOutput.length === 0) {
    return {
      valid: false,
      errors: ['Model output was empty. Expected raw JSON that matches the target schema.'],
    };
  }

  let jsonSource = trimmedOutput;

  if (containsMarkdownFence(trimmedOutput)) {
    if (!allowMarkdownFences) {
      return {
        valid: false,
        errors: ['Markdown fenced JSON is not allowed. Return raw JSON only without code fences.'],
      };
    }

    const fencedBlock = extractFencedJsonBlock(trimmedOutput);

    if (!fencedBlock) {
      return {
        valid: false,
        errors: ['Markdown fenced output must contain exactly one standalone JSON code block.'],
      };
    }

    jsonSource = fencedBlock;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonSource) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown JSON parse error.';

    return {
      valid: false,
      errors: [`Invalid JSON: ${message}`],
    };
  }

  const validation = await validateJson(parsed, resolve(schemaPath));

  if (!validation.valid) {
    return {
      valid: false,
      errors: validation.errors,
    };
  }

  return {
    valid: true,
    parsed: parsed as T,
    errors: [],
  };
}

export function createMemoryOutputRetryInstruction(input: {
  schemaPath: string;
  errors: string[];
  allowMarkdownFences?: boolean;
}): string {
  const fenceRule = input.allowMarkdownFences
    ? 'Return valid JSON only. If you use a code fence, it must be a single standalone JSON fence with no extra text.'
    : 'Return raw JSON only. Do not wrap the output in markdown fences.';

  const errorList = input.errors.map((error) => `- ${error}`).join('\n');

  return [
    `Your previous memory output did not validate against ${input.schemaPath}.`,
    fenceRule,
    'Do not add commentary or repair notes.',
    'Validation errors:',
    errorList,
  ].join('\n');
}
