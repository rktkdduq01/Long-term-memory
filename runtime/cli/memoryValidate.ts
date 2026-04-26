import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { createMemoryConfig } from '../config/memoryConfig.ts';
import { MEMORY_KINDS } from '../contracts/constants.ts';
import { validateBriefing } from '../contracts/validateBriefing.ts';
import { validateCandidate, validateCandidateSemantics } from '../contracts/validateCandidate.ts';
import { validateMemory, validateMemorySemantics } from '../contracts/validateMemory.ts';
import { validateSessionEvent } from '../contracts/validateSessionEvent.ts';
import type { MemoryMode } from '../contracts/types.ts';
import { sampleApprovalReview } from '../reference/sampleApprovalReview.ts';
import { sampleMemories, sampleSessionEvents } from '../reference/sampleBriefing.ts';
import { sampleCandidates } from '../reference/sampleCandidates.ts';
import { readAuditEvents } from '../store/auditStore.ts';
import { readCandidates } from '../store/candidateStore.ts';
import { readMemories } from '../store/memoryStore.ts';
import { readSessionEvents } from '../store/sessionStore.ts';
import { validateJson } from '../validateJson.ts';
import { buildMemoryBriefing } from './memoryBriefing.ts';
import { parseCliArgs } from './parseArgs.ts';

export interface MemoryValidateOptions {
  harnessRoot?: string;
  projectRoot?: string;
  repoRoot?: string;
  memoryDir?: string;
  mode?: MemoryMode;
  repoScope?: string;
}

export interface MemoryValidateResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
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

async function validateReferenceData(repoRoot: string, errors: string[], warnings: string[]): Promise<void> {
  for (const memory of sampleMemories) {
    errors.push(...(await validateMemory(memory, repoRoot)).map((error) => `sample memory ${memory.memory_id}: ${error}`));
    warnings.push(...validateMemorySemantics(memory).map((warning) => `sample memory ${memory.memory_id}: ${warning}`));
  }

  for (const candidate of sampleCandidates) {
    errors.push(...(await validateCandidate(candidate, repoRoot)).map((error) => `sample candidate ${candidate.candidate_id}: ${error}`));
    warnings.push(...validateCandidateSemantics(candidate).map((warning) => `sample candidate ${candidate.candidate_id}: ${warning}`));
  }

  for (const event of sampleSessionEvents) {
    errors.push(...(await validateSessionEvent(event, repoRoot)).map((error) => `sample session event ${event.event_id}: ${error}`));
  }

  const demoBriefing = await buildMemoryBriefing({
    harnessRoot: repoRoot,
    mode: 'demo',
    now: new Date('2026-04-26T00:00:00Z'),
  });
  errors.push(...(await validateBriefing(demoBriefing, repoRoot)).map((error) => `sample briefing: ${error}`));

  const approvalReview = await validateJson(sampleApprovalReview, resolve(repoRoot, 'schemas/approval-review.schema.json'));
  errors.push(...approvalReview.errors.map((error) => `sample approval review: ${error}`));
}

async function validateLocalStores(options: MemoryValidateOptions, errors: string[], warnings: string[]): Promise<void> {
  const config = createMemoryConfig({
    harnessRoot: options.harnessRoot,
    projectRoot: options.projectRoot,
    repoRoot: options.repoRoot,
    memoryDir: options.memoryDir,
    mode: options.mode ?? 'strict',
    repoScope: options.repoScope,
  });

  for (const kind of MEMORY_KINDS) {
    try {
      const memories = await readMemories(config, kind);

      for (const memory of memories) {
        warnings.push(...validateMemorySemantics(memory).map((warning) => `${kind} memory store: ${warning}`));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown memory store error';
      errors.push(`${kind} memory store: ${message}`);
    }
  }

  for (const status of ['pending', 'approved', 'rejected'] as const) {
    try {
      const candidates = await readCandidates(config, status);

      for (const candidate of candidates) {
        warnings.push(...validateCandidateSemantics(candidate).map((warning) => `${status} candidate store: ${warning}`));
      }
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
  const config = createMemoryConfig(options);
  const repoRoot = config.repoRoot;
  const errors: string[] = [];
  const warnings: string[] = [];

  await validateSchemas(repoRoot, errors);
  await validateReferenceData(repoRoot, errors, warnings);
  await validateLocalStores(options ?? {}, errors, warnings);

  const taskSchema = await validateJson(
    {
      task_id: 'task_validation',
      user_request: 'Validate schemas.',
      repo: config.repoScope,
      scope_type: 'repo',
      scope_value: config.repoScope,
      metadata: {},
    },
    resolve(repoRoot, 'schemas/task.schema.json'),
  );
  errors.push(...taskSchema.errors.map((error) => `task schema smoke: ${error}`));

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export interface MemoryValidateCliArgs {
  memoryDir?: string;
  projectRoot?: string;
  harnessRoot?: string;
  repoScope?: string;
}

type MemoryValidateCliKey = keyof MemoryValidateCliArgs;

export function parseMemoryValidateArgs(argv: string[]): MemoryValidateCliArgs {
  const parsed = parseCliArgs<MemoryValidateCliKey>(argv, {
    stringOptions: [
      { flag: '--memory-dir', key: 'memoryDir' },
      { flag: '--project-root', key: 'projectRoot' },
      { flag: '--harness-root', key: 'harnessRoot' },
      { flag: '--repo', key: 'repoScope' },
      { flag: '--repo-scope', key: 'repoScope' },
    ],
  });

  return {
    memoryDir: parsed.memoryDir as string | undefined,
    projectRoot: parsed.projectRoot as string | undefined,
    harnessRoot: parsed.harnessRoot as string | undefined,
    repoScope: parsed.repoScope as string | undefined,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseMemoryValidateArgs(process.argv.slice(2));
  const result = await validateMemoryHarness({
    harnessRoot: args.harnessRoot,
    projectRoot: args.projectRoot,
    memoryDir: args.memoryDir,
    repoScope: args.repoScope,
  });

  for (const warning of result.warnings) {
    console.warn(`WARNING: ${warning}`);
  }

  if (!result.valid) {
    for (const error of result.errors) {
      console.error(`ERROR: ${error}`);
    }
    process.exitCode = 1;
  } else {
    console.log('Memory harness validation passed.');
  }
}
