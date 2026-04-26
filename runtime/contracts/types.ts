import type { BRIEFING_MAX_ITEMS, BRIEFING_MAX_WORDS } from './constants.ts';

export type MemoryMode = 'strict' | 'demo';
export type MemoryKind = 'semantic' | 'episodic' | 'procedural' | 'project';
export type MemoryStatus = 'active' | 'superseded' | 'archived' | 'deprecated';
export type CandidateStatus = 'pending' | 'approved' | 'rejected';
export type SourceTrustLevel = 'trusted' | 'partially_trusted' | 'untrusted';
export type Sensitivity = 'public' | 'internal' | 'sensitive' | 'restricted';
export type FactOrInference = 'fact' | 'inference';
export type ScopeType = 'global_user' | 'repo' | 'branch' | 'directory' | 'file' | 'task_type' | 'session';
export type SourceType =
  | 'user_message'
  | 'agent_message'
  | 'tool_result'
  | 'file'
  | 'test_result'
  | 'ci_log'
  | 'repo_config'
  | 'manual_review'
  | 'session_event';

export type MemoryType =
  | 'user_preference'
  | 'repo_rule'
  | 'project_constraint'
  | 'failure_lesson'
  | 'success_pattern'
  | 'procedure'
  | 'approval_boundary'
  | 'unresolved_risk'
  | 'session_fact';

export type ConflictType = 'duplicate' | 'scope_overlap' | 'direct_conflict' | 'supersedes';
export type BriefingCategory = 'hard_rule' | 'preference' | 'recent_caution' | 'uncertainty' | 'conflict';
export type SessionEventType =
  | 'user_request'
  | 'assistant_action'
  | 'tool_run'
  | 'validation_result'
  | 'error'
  | 'review_feedback'
  | 'decision'
  | 'other';

export interface EvidenceRef {
  source_type: SourceType;
  source_id: string;
  quote_or_summary: string;
  observed_at: string;
  trust_level: SourceTrustLevel;
}

export interface ConflictRef {
  memory_id: string;
  conflict_type: ConflictType;
  note: string;
  confidence: number;
}

export interface TaskInput {
  task_id: string;
  user_request: string;
  repo: string;
  branch?: string;
  scope_type: ScopeType;
  scope_value: string;
  metadata: Record<string, unknown>;
}

export interface SessionEventRecord {
  event_id: string;
  event_type: SessionEventType;
  source_type: SourceType;
  source_id: string;
  observed_at: string;
  summary: string;
  related_files: string[];
  trust_level: SourceTrustLevel;
  metadata: Record<string, unknown>;
}

export interface MemoryRecord {
  memory_id: string;
  kind: MemoryKind;
  memory_type: MemoryType;
  gist: string;
  scope_type: ScopeType;
  scope_value: string;
  confidence: number;
  importance: number;
  status: MemoryStatus;
  created_at: string;
  updated_at: string;
  evidence_refs: EvidenceRef[];
  source_trust_level: SourceTrustLevel;
  sensitivity: Sensitivity;
  supersedes: string[];
  superseded_by: string | null;
  conflicts: ConflictRef[];
}

export interface MemoryCandidate {
  candidate_id: string;
  target_kind: MemoryKind;
  memory_type: MemoryType;
  gist: string;
  fact_or_inference: FactOrInference;
  status: CandidateStatus;
  scope_type: ScopeType;
  scope_value: string;
  confidence: number;
  future_usefulness: number;
  created_at: string;
  evidence_refs: EvidenceRef[];
  source_trust_level: SourceTrustLevel;
  sensitivity: Sensitivity;
  why_keep: string;
  uncertainty_note?: string;
  supersedes: string[];
  conflicts: ConflictRef[];
}

export interface BriefingItem {
  memory_id: string;
  kind: MemoryKind;
  category: BriefingCategory;
  gist: string;
  relevance: number;
  confidence: number;
  evidence_refs: EvidenceRef[];
}

export interface Briefing {
  task_id: string;
  generated_at: string;
  mode: MemoryMode;
  max_words: typeof BRIEFING_MAX_WORDS;
  max_items: typeof BRIEFING_MAX_ITEMS;
  items: BriefingItem[];
  rendered_briefing: string;
  warnings: string[];
}

export interface ApprovalEvent {
  event_id: string;
  action: 'candidate_generated' | 'candidate_approved' | 'candidate_rejected' | 'memory_superseded';
  candidate_id: string;
  memory_id: string | null;
  decided_at: string;
  decided_by: 'user' | 'runtime';
  reason: string;
  evidence_refs: EvidenceRef[];
}
