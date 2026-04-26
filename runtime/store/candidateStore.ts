import type { MemoryConfig } from '../config/memoryConfig.ts';
import type { ApprovalEvent, CandidateStatus, MemoryCandidate, MemoryRecord } from '../contracts/types.ts';
import { assertValidCandidate } from '../contracts/validateCandidate.ts';
import { appendAuditEvent } from './auditStore.ts';
import { appendJsonlLine, readJsonl, writeJsonl } from './jsonlStore.ts';
import { appendMemory, markMemoriesSuperseded } from './memoryStore.ts';

function candidatePath(config: MemoryConfig, status: MemoryCandidate['status']): string {
  switch (status) {
    case 'pending':
      return config.stores.candidates.pending;
    case 'approved':
      return config.stores.candidates.approved;
    case 'rejected':
      return config.stores.candidates.rejected;
  }
}

function nowIso(now = new Date()): string {
  return now.toISOString();
}

function evidenceForDecision(candidate: MemoryCandidate) {
  return candidate.evidence_refs.slice(0, 3);
}

function requireDecisionReason(reason: string, action: 'approve' | 'reject'): string {
  const trimmed = reason?.trim();

  if (!trimmed) {
    throw new Error(`A non-empty reason is required to ${action} a memory candidate.`);
  }

  return trimmed;
}

export function memoryIdFromCandidate(candidate: MemoryCandidate): string {
  return `mem_${candidate.candidate_id.replace(/^cand_/, '')}`;
}

export function memoryFromCandidate(candidate: MemoryCandidate, approvedAt: string): MemoryRecord {
  return {
    memory_id: memoryIdFromCandidate(candidate),
    kind: candidate.target_kind,
    memory_type: candidate.memory_type,
    gist: candidate.gist,
    scope_type: candidate.scope_type,
    scope_value: candidate.scope_value,
    confidence: candidate.confidence,
    importance: Math.max(candidate.confidence, candidate.future_usefulness),
    status: 'active',
    created_at: approvedAt,
    updated_at: approvedAt,
    evidence_refs: candidate.evidence_refs,
    source_trust_level: candidate.source_trust_level,
    sensitivity: candidate.sensitivity,
    supersedes: candidate.supersedes,
    superseded_by: null,
    conflicts: candidate.conflicts,
  };
}

export interface SkippedPendingCandidate {
  candidate: MemoryCandidate;
  existing_status: CandidateStatus;
  reason: 'duplicate_candidate_id';
}

export interface AppendPendingCandidatesOptions {
  replacePending?: boolean;
}

export interface AppendPendingCandidatesResult {
  appended: MemoryCandidate[];
  replaced: MemoryCandidate[];
  skipped: SkippedPendingCandidate[];
}

export async function readCandidates(
  config: MemoryConfig,
  status: MemoryCandidate['status'],
): Promise<MemoryCandidate[]> {
  const records = await readJsonl<unknown>(candidatePath(config, status));
  const candidates: MemoryCandidate[] = [];

  for (const record of records) {
    candidates.push(await assertValidCandidate(record, config.repoRoot));
  }

  return candidates;
}

export async function appendPendingCandidates(
  config: MemoryConfig,
  candidates: MemoryCandidate[],
  options?: AppendPendingCandidatesOptions,
): Promise<AppendPendingCandidatesResult> {
  const existingPending = await readCandidates(config, 'pending');
  const approved = await readCandidates(config, 'approved');
  const rejected = await readCandidates(config, 'rejected');
  const nextPending = [...existingPending];
  const pendingIndexes = new Map(existingPending.map((candidate, index) => [candidate.candidate_id, index]));
  const approvedIds = new Set(approved.map((candidate) => candidate.candidate_id));
  const rejectedIds = new Set(rejected.map((candidate) => candidate.candidate_id));
  const appended: MemoryCandidate[] = [];
  const replaced: MemoryCandidate[] = [];
  const skipped: SkippedPendingCandidate[] = [];

  for (const candidate of candidates) {
    const normalizedCandidate = await assertValidCandidate(
      {
        ...candidate,
        status: 'pending',
      },
      config.repoRoot,
    );

    if (approvedIds.has(normalizedCandidate.candidate_id)) {
      skipped.push({
        candidate: normalizedCandidate,
        existing_status: 'approved',
        reason: 'duplicate_candidate_id',
      });
      continue;
    }

    if (rejectedIds.has(normalizedCandidate.candidate_id)) {
      skipped.push({
        candidate: normalizedCandidate,
        existing_status: 'rejected',
        reason: 'duplicate_candidate_id',
      });
      continue;
    }

    const pendingIndex = pendingIndexes.get(normalizedCandidate.candidate_id);

    if (pendingIndex !== undefined) {
      if (options?.replacePending === true) {
        nextPending[pendingIndex] = normalizedCandidate;
        replaced.push(normalizedCandidate);
      } else {
        skipped.push({
          candidate: normalizedCandidate,
          existing_status: 'pending',
          reason: 'duplicate_candidate_id',
        });
      }
      continue;
    }

    pendingIndexes.set(normalizedCandidate.candidate_id, nextPending.length);
    nextPending.push(normalizedCandidate);
    appended.push(normalizedCandidate);
  }

  if (appended.length > 0 || replaced.length > 0) {
    await writeJsonl(config.stores.candidates.pending, nextPending);
  }

  for (const normalizedCandidate of appended) {
    await appendAuditEvent(config, {
      event_id: `audit_generated_${normalizedCandidate.candidate_id}_${Date.parse(normalizedCandidate.created_at)}`,
      action: 'candidate_generated',
      candidate_id: normalizedCandidate.candidate_id,
      memory_id: null,
      decided_at: normalizedCandidate.created_at,
      decided_by: 'runtime',
      reason: 'Runtime generated a pending candidate from local session events.',
      evidence_refs: evidenceForDecision(normalizedCandidate),
    });
  }

  return {
    appended,
    replaced,
    skipped,
  };
}

function removeCandidate(candidates: MemoryCandidate[], candidateId: string): {
  candidate: MemoryCandidate;
  remaining: MemoryCandidate[];
} {
  const candidate = candidates.find((entry) => entry.candidate_id === candidateId);

  if (!candidate) {
    throw new Error(`Pending candidate not found: ${candidateId}`);
  }

  return {
    candidate,
    remaining: candidates.filter((entry) => entry.candidate_id !== candidateId),
  };
}

export async function approveCandidate(config: MemoryConfig, input: {
  candidateId: string;
  reason: string;
  now?: Date;
}): Promise<{
  candidate: MemoryCandidate;
  memory: MemoryRecord;
  approvalEvent: ApprovalEvent;
  superseded: MemoryRecord[];
}> {
  const decidedAt = nowIso(input.now);
  const reason = requireDecisionReason(input.reason, 'approve');
  const pending = await readCandidates(config, 'pending');
  const { candidate, remaining } = removeCandidate(pending, input.candidateId);
  const approvedCandidate = await assertValidCandidate(
    {
      ...candidate,
      status: 'approved',
    },
    config.repoRoot,
  );
  const memory = memoryFromCandidate(approvedCandidate, decidedAt);

  await writeJsonl(config.stores.candidates.pending, remaining);
  await appendJsonlLine(config.stores.candidates.approved, approvedCandidate);
  await appendMemory(config, memory);

  const superseded = await markMemoriesSuperseded(config, approvedCandidate.supersedes, memory.memory_id, decidedAt);
  const approvalEvent: ApprovalEvent = {
    event_id: `audit_approved_${approvedCandidate.candidate_id}_${Date.parse(decidedAt)}`,
    action: 'candidate_approved',
    candidate_id: approvedCandidate.candidate_id,
    memory_id: memory.memory_id,
    decided_at: decidedAt,
    decided_by: 'user',
    reason,
    evidence_refs: evidenceForDecision(approvedCandidate),
  };

  await appendAuditEvent(config, approvalEvent);

  for (const supersededMemory of superseded) {
    await appendAuditEvent(config, {
      event_id: `audit_superseded_${supersededMemory.memory_id}_${Date.parse(decidedAt)}`,
      action: 'memory_superseded',
      candidate_id: approvedCandidate.candidate_id,
      memory_id: supersededMemory.memory_id,
      decided_at: decidedAt,
      decided_by: 'user',
      reason: `Approved ${memory.memory_id} superseded ${supersededMemory.memory_id}.`,
      evidence_refs: evidenceForDecision(approvedCandidate),
    });
  }

  return {
    candidate: approvedCandidate,
    memory,
    approvalEvent,
    superseded,
  };
}

export async function rejectCandidate(config: MemoryConfig, input: {
  candidateId: string;
  reason: string;
  now?: Date;
}): Promise<{
  candidate: MemoryCandidate;
  rejectionEvent: ApprovalEvent;
}> {
  const decidedAt = nowIso(input.now);
  const reason = requireDecisionReason(input.reason, 'reject');
  const pending = await readCandidates(config, 'pending');
  const { candidate, remaining } = removeCandidate(pending, input.candidateId);
  const rejectedCandidate = await assertValidCandidate(
    {
      ...candidate,
      status: 'rejected',
    },
    config.repoRoot,
  );

  await writeJsonl(config.stores.candidates.pending, remaining);
  await appendJsonlLine(config.stores.candidates.rejected, rejectedCandidate);

  const rejectionEvent: ApprovalEvent = {
    event_id: `audit_rejected_${rejectedCandidate.candidate_id}_${Date.parse(decidedAt)}`,
    action: 'candidate_rejected',
    candidate_id: rejectedCandidate.candidate_id,
    memory_id: null,
    decided_at: decidedAt,
    decided_by: 'user',
    reason,
    evidence_refs: evidenceForDecision(rejectedCandidate),
  };

  await appendAuditEvent(config, rejectionEvent);

  return {
    candidate: rejectedCandidate,
    rejectionEvent,
  };
}
