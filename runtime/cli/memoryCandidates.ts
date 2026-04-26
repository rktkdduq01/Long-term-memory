import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { createMemoryConfig } from '../config/memoryConfig.ts';
import type { MemoryCandidate, MemoryMode, SessionEventRecord } from '../contracts/types.ts';
import { assertValidCandidate } from '../contracts/validateCandidate.ts';
import { attachConflicts } from '../retrieval/detectConflicts.ts';
import { readAllMemories } from '../store/memoryStore.ts';
import { appendPendingCandidates } from '../store/candidateStore.ts';
import { readSessionEvents } from '../store/sessionStore.ts';
import { sampleCandidates } from '../reference/sampleCandidates.ts';
import { sampleSessionEvents } from '../reference/sampleBriefing.ts';

export interface GenerateMemoryCandidatesOptions {
  repoRoot?: string;
  memoryDir?: string;
  mode?: MemoryMode;
  sessionPath?: string;
  dryRun?: boolean;
  now?: Date;
}

function candidateIdForEvent(event: SessionEventRecord): string {
  return `cand_${event.event_id.replace(/^evt_/, '')}`;
}

function scopeForEvent(event: SessionEventRecord): Pick<MemoryCandidate, 'scope_type' | 'scope_value' | 'target_kind'> {
  if (event.related_files.length === 1) {
    return {
      scope_type: 'file',
      scope_value: event.related_files[0],
      target_kind: 'project',
    };
  }

  if (event.related_files.length > 1) {
    const directories = [...new Set(event.related_files.map((file) => file.split('/')[0]).filter(Boolean))];

    if (directories.length === 1) {
      return {
        scope_type: 'directory',
        scope_value: `${directories[0]}/`,
        target_kind: 'project',
      };
    }
  }

  return {
    scope_type: 'repo',
    scope_value: 'rktkdduq01/Long-term-memory',
    target_kind: event.event_type === 'decision' ? 'procedural' : 'semantic',
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

function eventToCandidate(event: SessionEventRecord, now: Date): MemoryCandidate | null {
  if (!['user_request', 'error', 'validation_result', 'decision', 'review_feedback'].includes(event.event_type)) {
    return null;
  }

  const scope = scopeForEvent(event);
  const confidence = scoreForTrust(event.trust_level);

  const candidate: MemoryCandidate = {
    candidate_id: candidateIdForEvent(event),
    target_kind: scope.target_kind,
    memory_type: memoryTypeForEvent(event),
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

export async function generateMemoryCandidates(options?: GenerateMemoryCandidatesOptions): Promise<MemoryCandidate[]> {
  const mode = options?.mode ?? 'strict';
  const now = options?.now ?? new Date();
  const config = createMemoryConfig({
    repoRoot: options?.repoRoot,
    memoryDir: options?.memoryDir,
    mode,
  });
  const events = mode === 'demo' ? sampleSessionEvents : await readSessionEvents(config, options?.sessionPath);
  const existingMemories = mode === 'demo' ? [] : await readAllMemories(config);
  const generated = mode === 'demo'
    ? sampleCandidates
    : events
        .map((event) => eventToCandidate(event, now))
        .filter((candidate): candidate is MemoryCandidate => candidate !== null)
        .map((candidate) => attachConflicts(candidate, existingMemories));
  const validated: MemoryCandidate[] = [];

  for (const candidate of generated) {
    validated.push(await assertValidCandidate(candidate, config.repoRoot));
  }

  if (mode !== 'demo' && options?.dryRun !== true) {
    await appendPendingCandidates(config, validated);
  }

  return validated;
}

function parseArgs(argv: string[]) {
  const parsed: {
    demo: boolean;
    dryRun: boolean;
    sessionPath?: string;
    memoryDir?: string;
  } = {
    demo: false,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--demo') {
      parsed.demo = true;
    } else if (argument === '--dry-run') {
      parsed.dryRun = true;
    } else if (argument === '--session') {
      parsed.sessionPath = argv[index + 1];
      index += 1;
    } else if (argument === '--memory-dir') {
      parsed.memoryDir = argv[index + 1];
      index += 1;
    }
  }

  return parsed;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const candidates = await generateMemoryCandidates({
    mode: args.demo ? 'demo' : 'strict',
    sessionPath: args.sessionPath,
    dryRun: args.dryRun,
    memoryDir: args.memoryDir,
  });
  process.stdout.write(`${JSON.stringify(candidates, null, 2)}\n`);
}
