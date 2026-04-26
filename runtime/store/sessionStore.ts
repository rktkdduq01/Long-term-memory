import { readFile } from 'node:fs/promises';

import type { MemoryConfig } from '../config/memoryConfig.ts';
import type { SessionEventRecord } from '../contracts/types.ts';
import { assertValidSessionEvent } from '../contracts/validateSessionEvent.ts';
import { appendJsonl, readJsonl } from './jsonlStore.ts';

async function readSessionJsonArray(path: string): Promise<unknown[]> {
  const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error(`Session file must contain a JSON array or JSONL records: ${path}`);
  }

  return parsed;
}

export async function readSessionEvents(config: MemoryConfig, sessionPath?: string): Promise<SessionEventRecord[]> {
  const path = sessionPath ?? config.stores.sessions.latest;
  const rawEvents = path.endsWith('.json') ? await readSessionJsonArray(path) : await readJsonl<unknown>(path);
  const events: SessionEventRecord[] = [];

  for (const rawEvent of rawEvents) {
    events.push(await assertValidSessionEvent(rawEvent, config.repoRoot));
  }

  return events;
}

export async function appendSessionEvent(config: MemoryConfig, event: SessionEventRecord): Promise<void> {
  await assertValidSessionEvent(event, config.repoRoot);
  await appendJsonl(config.stores.sessions.latest, event);
}
