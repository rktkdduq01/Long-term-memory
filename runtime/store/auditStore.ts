import { resolve } from 'node:path';

import type { MemoryConfig } from '../config/memoryConfig.ts';
import type { ApprovalEvent } from '../contracts/types.ts';
import { validateJson } from '../validateJson.ts';
import { appendJsonlLine, readJsonl } from './jsonlStore.ts';

export async function validateApprovalEvent(event: unknown, repoRoot: string): Promise<string[]> {
  const result = await validateJson(event, resolve(repoRoot, 'schemas/approval-event.schema.json'));
  return result.errors;
}

export async function appendAuditEvent(config: MemoryConfig, event: ApprovalEvent): Promise<void> {
  const errors = await validateApprovalEvent(event, config.repoRoot);

  if (errors.length > 0) {
    throw new Error(`Approval event failed validation:\n${errors.join('\n')}`);
  }

  await appendJsonlLine(config.stores.audit, event);
}

export async function readAuditEvents(config: MemoryConfig): Promise<ApprovalEvent[]> {
  const events = await readJsonl<unknown>(config.stores.audit);
  const validated: ApprovalEvent[] = [];

  for (const event of events) {
    const errors = await validateApprovalEvent(event, config.repoRoot);

    if (errors.length > 0) {
      throw new Error(`Approval event failed validation:\n${errors.join('\n')}`);
    }

    validated.push(event as ApprovalEvent);
  }

  return validated;
}
