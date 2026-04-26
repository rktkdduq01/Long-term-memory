import { resolve } from 'node:path';

import { getRepoRoot } from '../loadPrompt.ts';
import { validateJson } from '../validateJson.ts';
import type { SessionEventRecord } from './types.ts';

export async function validateSessionEvent(event: unknown, repoRoot = getRepoRoot()): Promise<string[]> {
  const result = await validateJson(event, resolve(repoRoot, 'schemas/session-event.schema.json'));
  return result.errors;
}

export async function assertValidSessionEvent(event: unknown, repoRoot = getRepoRoot()): Promise<SessionEventRecord> {
  const errors = await validateSessionEvent(event, repoRoot);

  if (errors.length > 0) {
    throw new Error(`Session event failed validation:\n${errors.join('\n')}`);
  }

  return event as SessionEventRecord;
}
