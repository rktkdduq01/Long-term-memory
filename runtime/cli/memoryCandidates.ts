import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { createMemoryConfig } from '../config/memoryConfig.ts';
import type { MemoryCandidate, MemoryKind, MemoryMode, MemoryType, SessionEventRecord } from '../contracts/types.ts';
import { assertValidCandidate } from '../contracts/validateCandidate.ts';
import { attachConflicts } from '../retrieval/detectConflicts.ts';
import { readAllMemories } from '../store/memoryStore.ts';
import { appendPendingCandidates, type AppendPendingCandidatesResult } from '../store/candidateStore.ts';
import { readSessionEvents } from '../store/sessionStore.ts';
import { sampleCandidates } from '../reference/sampleCandidates.ts';
import { sampleSessionEvents } from '../reference/sampleBriefing.ts';
import { parseCliArgs } from './parseArgs.ts';

export interface GenerateMemoryCandidatesOptions {
  harnessRoot?: string;
  projectRoot?: string;
  repoRoot?: string;
  memoryDir?: string;
  mode?: MemoryMode;
  repoScope?: string;
  sessionPath?: string;
  dryRun?: boolean;
  replacePending?: boolean;
  now?: Date;
}

export interface GenerateMemoryCandidatesResult extends AppendPendingCandidatesResult {
  generated: MemoryCandidate[];
}

function candidateIdForEvent(event: SessionEventRecord): string {
  return `cand_${event.event_id.replace(/^evt_/, '')}`;
}

function scopeForEvent(event: SessionEventRecord, repoScope: string): Pick<MemoryCandidate, 'scope_type' | 'scope_value'> {
  if (event.related_files.length === 1) {
    return {
      scope_type: 'file',
      scope_value: event.related_files[0],
    };
  }

  if (event.related_files.length > 1) {
    const directories = [...new Set(event.related_files.map((file) => file.split('/')[0]).filter(Boolean))];

    if (directories.length === 1) {
      return {
        scope_type: 'directory',
        scope_value: `${directories[0]}/`,
      };
    }
  }

  return {
    scope_type: 'repo',
    scope_value: repoScope,
  };
}

function memoryTypeForEvent(event: SessionEventRecord): MemoryCandidate['memory_type'] {
  switch (event.event_type) {
    case 'user_request':
      return 'project_constraint';
    case 'error':
    case 'validation_result':
      return 'failure_lesson';
    case 'decision':
      return 'success_pattern';
    case 'review_feedback':
      return 'unresolved_risk';
    default:
      return 'session_fact';
  }
}

function targetKindForMemoryType(memoryType: MemoryType): MemoryKind {
  switch (memoryType) {
    case 'project_constraint':
    case 'unresolved_risk':
      return 'project';
    case 'procedure':
    case 'success_pattern':
    case 'failure_lesson':
      return 'procedural';
    case 'user_preference':
    case 'repo_rule':
    case 'session_fact':
      return 'semantic';
    case 'approval_boundary':
      return 'project';
  }
}

function scoreForTrust(trustLevel: SessionEventRecord['trust_level']): number {
  switch (trustLevel) {
    case 'trusted':
      return 0.95;
    case 'partially_trusted':
      return 0.72;
    case 'untrusted':
      return 0.35;
  }
}

function eventToCandidate(event: SessionEventRecord, now: Date, repoScope: string): MemoryCandidate | null {
  if (!['user_request', 'error', 'validation_result', 'decision', 'review_feedback'].includes(event.event_type)) {
    return null;
  }

  const scope = scopeForEvent(event, repoScope);
  const memoryType = memoryTypeForEvent(event);
  const confidence = scoreForTrust(event.trust_level);

  const candidate: MemoryCandidate = {
    candidate_id: candidateIdForEvent(event),
    target_kind: targetKindForMemoryType(memoryType),
    memory_type: memoryType,
    gist: event.summary,
    fact_or_inference: event.event_type === 'review_feedback' || event.event_type === 'decision' ? 'inference' : 'fact',
    status: 'pending',
    scope_type: scope.scope_type,
    scope_value: scope.scope_value,
    confidence,
    future_usefulness: Math.min(1, confidence + 0.03),
    created_at: now.toISOString(),
    evidence_refs: [
      {
        source_type: event.source_type,
        source_id: event.source_id,
        quote_or_summary: event.summary,
        observed_at: event.observed_at,
        trust_level: event.trust_level,
      },
    ],
    source_trust_level: event.trust_level,
    sensitivity: 'internal',
    why_keep: 'The event may affect future Codex CLI memory harness behavior.',
    supersedes: [],
    conflicts: [],
  };

  if (confidence < 0.8) {
    candidate.uncertainty_note = 'Evidence is limited; keep pending until reviewed by the user.';
  }

  return candidate;
}

function emptyAppendResult(): AppendPendingCandidatesResult {
  return {
    appended: [],
    replaced: [],
    skipped: [],
  };
}

export async function generateMemoryCandidatesWithReport(
  options?: GenerateMemoryCandidatesOptions,
): Promise<GenerateMemoryCandidatesResult> {
  const mode = options?.mode ?? 'strict';
  const now = options?.now ?? new Date();
  const config = createMemoryConfig({
    harnessRoot: options?.harnessRoot,
    projectRoot: options?.projectRoot,
    repoRoot: options?.repoRoot,
    memoryDir: options?.memoryDir,
    mode,
    repoScope: options?.repoScope,
  });
  const events = mode === 'demo' ? sampleSessionEvents : await readSessionEvents(config, options?.sessionPath);
  const existingMemories = mode === 'demo' ? [] : await readAllMemories(config);
  const generated = mode === 'demo'
    ? sampleCandidates
    : events
        .map((event) => eventToCandidate(event, now, config.repoScope))
        .filter((candidate): candidate is MemoryCandidate => candidate !== null)
        .map((candidate) => attachConflicts(candidate, existingMemories));
  const validated: MemoryCandidate[] = [];

  for (const candidate of generated) {
    validated.push(await assertValidCandidate(candidate, config.repoRoot));
  }

  if (mode === 'demo' || options?.dryRun === true) {
    return {
      generated: validated,
      ...emptyAppendResult(),
    };
  }

  const appendResult = await appendPendingCandidates(config, validated, {
    replacePending: options?.replacePending,
  });

  return {
    generated: validated,
    ...appendResult,
  };
}

export async function generateMemoryCandidates(options?: GenerateMemoryCandidatesOptions): Promise<MemoryCandidate[]> {
  const result = await generateMemoryCandidatesWithReport(options);

  if ((options?.mode ?? 'strict') === 'demo' || options?.dryRun === true) {
    return result.generated;
  }

  return result.appended;
}

export interface MemoryCandidatesCliArgs {
  demo: boolean;
  dryRun: boolean;
  replacePending: boolean;
  report: boolean;
  sessionPath?: string;
  memoryDir?: string;
  projectRoot?: string;
  harnessRoot?: string;
  repoScope?: string;
}

type MemoryCandidatesCliKey = keyof MemoryCandidatesCliArgs;

export function parseMemoryCandidatesArgs(argv: string[]): MemoryCandidatesCliArgs {
  const parsed = parseCliArgs<MemoryCandidatesCliKey>(argv, {
    booleanFlags: [
      { flag: '--demo', key: 'demo' },
      { flag: '--dry-run', key: 'dryRun' },
      { flag: '--replace-pending', key: 'replacePending' },
      { flag: '--report', key: 'report' },
    ],
    stringOptions: [
      { flag: '--session', key: 'sessionPath' },
      { flag: '--memory-dir', key: 'memoryDir' },
      { flag: '--project-root', key: 'projectRoot' },
      { flag: '--harness-root', key: 'harnessRoot' },
      { flag: '--repo', key: 'repoScope' },
      { flag: '--repo-scope', key: 'repoScope' },
    ],
  });

  return {
    demo: parsed.demo === true,
    dryRun: parsed.dryRun === true,
    replacePending: parsed.replacePending === true,
    report: parsed.report === true,
    sessionPath: parsed.sessionPath as string | undefined,
    memoryDir: parsed.memoryDir as string | undefined,
    projectRoot: parsed.projectRoot as string | undefined,
    harnessRoot: parsed.harnessRoot as string | undefined,
    repoScope: parsed.repoScope as string | undefined,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseMemoryCandidatesArgs(process.argv.slice(2));
  const options = {
    mode: args.demo ? 'demo' : 'strict',
    sessionPath: args.sessionPath,
    dryRun: args.dryRun,
    replacePending: args.replacePending,
    harnessRoot: args.harnessRoot,
    projectRoot: args.projectRoot,
    memoryDir: args.memoryDir,
    repoScope: args.repoScope,
  } satisfies GenerateMemoryCandidatesOptions;
  const output = args.report
    ? await generateMemoryCandidatesWithReport(options)
    : await generateMemoryCandidates(options);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}
