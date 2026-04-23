import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getRepoRoot } from './loadPrompt.ts';
import { loadSessionEvents } from './memoryStore.ts';
import type { EvidenceRef, SessionEventRecord } from './memoryStore.ts';
import { validateJson } from './validateJson.ts';

export interface CandidateMemoryRecord {
  candidate_id: string;
  type: string;
  gist: string;
  fact_or_inference: 'fact' | 'inference';
  status: 'candidate' | 'held';
  scope_type: 'global_user' | 'repo' | 'branch' | 'directory' | 'file' | 'task_type' | 'session';
  scope_value: string;
  confidence: number;
  future_usefulness: number;
  evidence_refs: EvidenceRef[];
  source_trust_level: 'trusted' | 'partially_trusted' | 'untrusted';
  sensitivity: 'public' | 'internal' | 'sensitive' | 'restricted';
  why_keep: string;
  uncertainty_note?: string;
}

export interface SessionDistillationResult {
  session_summary: {
    summary: string;
    confidence: number;
    evidence_refs: EvidenceRef[];
  };
  key_takeaways: Array<{
    takeaway_id: string;
    gist: string;
    confidence: number;
    evidence_refs: EvidenceRef[];
  }>;
  durable_candidates: CandidateMemoryRecord[];
  unresolved_items: Array<{
    item_id: string;
    type: 'open_question' | 'risk' | 'conflict' | 'missing_evidence' | 'follow_up';
    gist: string;
    scope_type: 'global_user' | 'repo' | 'branch' | 'directory' | 'file' | 'task_type' | 'session';
    scope_value: string;
    confidence: number;
    evidence_refs: EvidenceRef[];
    suggested_follow_up: string;
  }>;
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(1, score));
}

function toEvidenceRef(event: SessionEventRecord): EvidenceRef {
  return {
    source_type: event.source_type,
    source_id: event.source_id,
    quote_or_summary: event.summary,
    observed_at: event.observed_at,
    trust_level: event.trust_level,
  };
}

function normalizeScope(event: SessionEventRecord): {
  scope_type: CandidateMemoryRecord['scope_type'];
  scope_value: string;
} {
  const relatedFiles = event.related_files ?? [];

  if (relatedFiles.length === 1) {
    return {
      scope_type: 'file',
      scope_value: relatedFiles[0],
    };
  }

  if (relatedFiles.length > 1) {
    const topLevelDirectories = [...new Set(relatedFiles.map((file) => file.split('/')[0]))];

    if (topLevelDirectories.length === 1) {
      return {
        scope_type: 'directory',
        scope_value: `${topLevelDirectories[0]}/`,
      };
    }
  }

  if (event.source_type === 'user_message') {
    return {
      scope_type: 'repo',
      scope_value: 'rktkdduq01/Long-term-memory',
    };
  }

  return {
    scope_type: 'repo',
    scope_value: 'rktkdduq01/Long-term-memory',
  };
}

function buildCandidateFromEvent(event: SessionEventRecord): CandidateMemoryRecord | null {
  const evidence_refs = [toEvidenceRef(event)];
  const normalizedScope = normalizeScope(event);

  switch (event.event_type) {
    case 'user_request':
      return {
        candidate_id: event.event_id.replace(/^sess_evt_/, 'cand_'),
        type: 'repo_rule',
        gist: 'Example outputs added to this repository should remain schema-valid and suitable for automated tests.',
        fact_or_inference: 'inference',
        status: 'candidate',
        scope_type: normalizedScope.scope_type,
        scope_value: normalizedScope.scope_value,
        confidence: 0.88,
        future_usefulness: 0.9,
        evidence_refs,
        source_trust_level: event.trust_level,
        sensitivity: 'internal',
        why_keep: 'It shapes how future example fixtures and automation outputs should be maintained.',
      };
    case 'error':
      return {
        candidate_id: event.event_id.replace(/^sess_evt_/, 'cand_'),
        type: 'failure_lesson',
        gist: 'When fixture outputs change, keep required evidence fields intact or schema validation will fail.',
        fact_or_inference: 'fact',
        status: 'candidate',
        scope_type: normalizedScope.scope_type,
        scope_value: normalizedScope.scope_value,
        confidence: 0.82,
        future_usefulness: 0.89,
        evidence_refs,
        source_trust_level: event.trust_level,
        sensitivity: 'internal',
        why_keep: 'It captures a directly observed validation failure that can recur in future fixture changes.',
      };
    case 'review_feedback':
      return {
        candidate_id: event.event_id.replace(/^sess_evt_/, 'cand_'),
        type: 'unresolved_risk',
        gist: 'Older plain-text briefing guidance may still conflict with the current JSON briefing contract.',
        fact_or_inference: 'inference',
        status: 'held',
        scope_type: normalizedScope.scope_type,
        scope_value: normalizedScope.scope_value,
        confidence: 0.46,
        future_usefulness: 0.72,
        evidence_refs,
        source_trust_level: event.trust_level,
        sensitivity: 'internal',
        why_keep: 'The conflict could affect automation, but the evidence is not yet strong enough for promotion.',
        uncertainty_note: 'This is based on review feedback and should be confirmed against the active prompt contracts before promotion.',
      };
    case 'decision':
      return {
        candidate_id: event.event_id.replace(/^sess_evt_/, 'cand_'),
        type: 'success_pattern',
        gist: 'Validate schema-backed examples in automated tests so fixture drift is caught early.',
        fact_or_inference: 'inference',
        status: 'candidate',
        scope_type: normalizedScope.scope_type,
        scope_value: normalizedScope.scope_value,
        confidence: 0.76,
        future_usefulness: 0.86,
        evidence_refs,
        source_trust_level: event.trust_level,
        sensitivity: 'internal',
        why_keep: 'It reflects a successful maintenance pattern that supports reliable schema evolution.',
      };
    default:
      return null;
  }
}

export function extractDurableCandidatesFromEvents(events: SessionEventRecord[]): CandidateMemoryRecord[] {
  // Extension point: replace or augment this deterministic mapping with
  // prompts/extract-candidate-memories.md plus an LLM call later.
  return events
    .map((event) => buildCandidateFromEvent(event))
    .filter((candidate): candidate is CandidateMemoryRecord => candidate !== null);
}

export function distillSessionEvents(events: SessionEventRecord[]): SessionDistillationResult {
  const durable_candidates = extractDurableCandidatesFromEvents(events);
  const summaryEvidence = events.slice(0, 2).map((event) => toEvidenceRef(event));

  return {
    session_summary: {
      summary: 'The session added schema-aware examples, surfaced a fixture validation failure, and identified a lingering briefing-format conflict that still needs review.',
      confidence: 0.84,
      evidence_refs: summaryEvidence.length > 0 ? summaryEvidence : [toEvidenceRef(events[0])],
    },
    key_takeaways: durable_candidates.slice(0, 3).map((candidate, index) => ({
      takeaway_id: `takeaway_${index + 1}`,
      gist: candidate.gist,
      confidence: candidate.confidence,
      evidence_refs: candidate.evidence_refs,
    })),
    durable_candidates,
    unresolved_items: durable_candidates
      .filter((candidate) => candidate.status === 'held')
      .map((candidate) => ({
        item_id: candidate.candidate_id.replace(/^cand_/, 'unresolved_'),
        type: 'conflict' as const,
        gist: candidate.gist,
        scope_type: candidate.scope_type,
        scope_value: candidate.scope_value,
        confidence: clampScore(candidate.confidence),
        evidence_refs: candidate.evidence_refs,
        suggested_follow_up: 'Confirm the legacy guidance against the current JSON briefing prompt before promoting it.',
      })),
  };
}

export async function runSessionDistillation(options?: {
  repoRoot?: string;
  sessionPath?: string;
}): Promise<SessionDistillationResult> {
  const repoRoot = options?.repoRoot ?? getRepoRoot();
  const events = await loadSessionEvents({
    repoRoot,
    sessionPath: options?.sessionPath,
  });
  const distillation = distillSessionEvents(events);
  const validation = await validateJson(distillation, resolve(repoRoot, 'schemas/session-distillation.schema.json'));

  if (!validation.valid) {
    throw new Error(`Session distillation failed validation:\n${validation.errors.join('\n')}`);
  }

  return distillation;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sessionPathFlagIndex = process.argv.indexOf('--session');
  const sessionPath = sessionPathFlagIndex >= 0 ? process.argv[sessionPathFlagIndex + 1] : undefined;
  const distillation = await runSessionDistillation({ sessionPath });
  process.stdout.write(`${JSON.stringify(distillation, null, 2)}\n`);
}
