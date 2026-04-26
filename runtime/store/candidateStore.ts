import type { MemoryConfig } from '../config/memoryConfig.ts';
import type { ApprovalEvent, MemoryCandidate, MemoryRecord } from '../contracts/types.ts';
import { assertValidCandidate } from '../contracts/validateCandidate.ts';
import { appendAuditEvent } from './auditStore.ts';
import { appendJsonl, readJsonl, writeJsonl } from './jsonlStore.ts';
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
): Promise<MemoryCandidate[]> {
  const pending: MemoryCandidate[] = [];

  for (const candidate of candidates) {
    const normalizedCandidate = await assertValidCandidate(
      {
        ...candidate,
        status: 'pending',
      },
      config.repoRoot,
    );
    await appendJsonl(config.stores.candidates.pending, normalizedCandidate);
    pending.push(normalizedCandidate);
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

  return pending;
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
  await appendJsonl(config.stores.candidates.approved, approvedCandidate);
  await appendMemory(config, memory);

  const superseded = await markMemoriesSuperseded(config, approvedCandidate.supersedes, memory.memory_id, decidedAt);
  const approvalEvent: ApprovalEvent = {
    event_id: `audit_approved_${approvedCandidate.candidate_id}_${Date.parse(decidedAt)}`,
    action: 'candidate_approved',
    candidate_id: approvedCandidate.candidate_id,
    memory_id: memory.memory_id,
    decided_at: decidedAt,
    decided_by: 'user',
    reason: input.reason,
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
  await appendJsonl(config.stores.candidates.rejected, rejectedCandidate);

  const rejectionEvent: ApprovalEvent = {
    event_id: `audit_rejected_${rejectedCandidate.candidate_id}_${Date.parse(decidedAt)}`,
    action: 'candidate_rejected',
    candidate_id: rejectedCandidate.candidate_id,
    memory_id: null,
    decided_at: decidedAt,
    decided_by: 'user',
    reason: input.reason,
    evidence_refs: evidenceForDecision(rejectedCandidate),
  };

  await appendAuditEvent(config, rejectionEvent);

  return {
    candidate: rejectedCandidate,
    rejectionEvent,
  };
}
