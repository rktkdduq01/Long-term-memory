import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { createMemoryConfig } from '../config/memoryConfig.ts';
import { MEMORY_KINDS } from '../contracts/constants.ts';
import { validateBriefing } from '../contracts/validateBriefing.ts';
import { validateCandidate } from '../contracts/validateCandidate.ts';
import { validateMemory } from '../contracts/validateMemory.ts';
import { validateSessionEvent } from '../contracts/validateSessionEvent.ts';
import type { MemoryMode } from '../contracts/types.ts';
import { sampleMemories, sampleSessionEvents } from '../reference/sampleBriefing.ts';
import { sampleCandidates } from '../reference/sampleCandidates.ts';
import { readAuditEvents } from '../store/auditStore.ts';
import { readCandidates } from '../store/candidateStore.ts';
import { readMemories } from '../store/memoryStore.ts';
import { readSessionEvents } from '../store/sessionStore.ts';
import { validateJson } from '../validateJson.ts';
import { buildMemoryBriefing } from './memoryBriefing.ts';

export interface MemoryValidateOptions {
  repoRoot?: string;
  memoryDir?: string;
  mode?: MemoryMode;
}

export interface MemoryValidateResult {
  valid: boolean;
  errors: string[];
}

async function validateSchemas(repoRoot: string, errors: string[]): Promise<void> {
  const schemasDir = resolve(repoRoot, 'schemas');
  const schemaFiles = (await readdir(schemasDir)).filter((entry) => entry.endsWith('.json'));

  for (const schemaFile of schemaFiles) {
    try {
      JSON.parse(await readFile(resolve(schemasDir, schemaFile), 'utf8'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown JSON parse error';
      errors.push(`${schemaFile}: ${message}`);
    }
  }
}

async function validateReferenceData(repoRoot: string, errors: string[]): Promise<void> {
  for (const memory of sampleMemories) {
    errors.push(...(await validateMemory(memory, repoRoot)).map((error) => `sample memory ${memory.memory_id}: ${error}`));
  }

  for (const candidate of sampleCandidates) {
    errors.push(...(await validateCandidate(candidate, repoRoot)).map((error) => `sample candidate ${candidate.candidate_id}: ${error}`));
  }

  for (const event of sampleSessionEvents) {
    errors.push(...(await validateSessionEvent(event, repoRoot)).map((error) => `sample session event ${event.event_id}: ${error}`));
  }

  const demoBriefing = await buildMemoryBriefing({
    repoRoot,
    mode: 'demo',
    now: new Date('2026-04-26T00:00:00Z'),
  });
  errors.push(...(await validateBriefing(demoBriefing, repoRoot)).map((error) => `sample briefing: ${error}`));
}

async function validateLocalStores(options: MemoryValidateOptions, errors: string[]): Promise<void> {
  const config = createMemoryConfig({
    repoRoot: options.repoRoot,
    memoryDir: options.memoryDir,
    mode: options.mode ?? 'strict',
  });

  for (const kind of MEMORY_KINDS) {
    try {
      await readMemories(config, kind);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown memory store error';
      errors.push(`${kind} memory store: ${message}`);
    }
  }

  for (const status of ['pending', 'approved', 'rejected'] as const) {
    try {
      await readCandidates(config, status);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown candidate store error';
      errors.push(`${status} candidate store: ${message}`);
    }
  }

  try {
    await readSessionEvents(config);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT')) {
      const message = error instanceof Error ? error.message : 'Unknown session store error';
      errors.push(`session store: ${message}`);
    }
  }

  try {
    await readAuditEvents(config);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown audit store error';
    errors.push(`audit store: ${message}`);
  }
}

export async function validateMemoryHarness(options?: MemoryValidateOptions): Promise<MemoryValidateResult> {
  const repoRoot = options?.repoRoot ?? createMemoryConfig(options).repoRoot;
  const errors: string[] = [];

  await validateSchemas(repoRoot, errors);
  await validateReferenceData(repoRoot, errors);
  await validateLocalStores(options ?? {}, errors);

  const taskSchema = await validateJson(
    {
      task_id: 'task_validation',
      user_request: 'Validate schemas.',
      repo: 'local',
      scope_type: 'repo',
      scope_value: 'local',
      metadata: {},
    },
    resolve(repoRoot, 'schemas/task.schema.json'),
  );
  errors.push(...taskSchema.errors.map((error) => `task schema smoke: ${error}`));

  return {
    valid: errors.length === 0,
    errors,
  };
}

function parseArgs(argv: string[]) {
  const parsed: {
    memoryDir?: string;
  } = {};

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--memory-dir') {
      parsed.memoryDir = argv[index + 1];
      index += 1;
    }
  }

  return parsed;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const result = await validateMemoryHarness({
    memoryDir: args.memoryDir,
  });

  if (!result.valid) {
    for (const error of result.errors) {
      console.error(`ERROR: ${error}`);
    }
    process.exitCode = 1;
  } else {
    console.log('Memory harness validation passed.');
  }
}
