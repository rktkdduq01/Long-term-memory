import { BRIEFING_MAX_ITEMS } from '../contracts/constants.ts';
import type { BriefingCategory, MemoryRecord, TaskInput } from '../contracts/types.ts';
import { scopeScore } from './filterByScope.ts';
import { scoreEvidence } from './scoreEvidence.ts';

export interface RankedMemory {
  memory: MemoryRecord;
  relevance: number;
  category: BriefingCategory;
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(1, score));
}

function categoryForMemory(memory: MemoryRecord): BriefingCategory {
  if (memory.conflicts.length > 0) {
    return 'conflict';
  }

  switch (memory.memory_type) {
    case 'repo_rule':
    case 'project_constraint':
    case 'approval_boundary':
      return 'hard_rule';
    case 'user_preference':
      return 'preference';
    case 'failure_lesson':
    case 'unresolved_risk':
      return memory.confidence < 0.6 ? 'uncertainty' : 'recent_caution';
    default:
      return memory.confidence < 0.55 ? 'uncertainty' : 'recent_caution';
  }
}

export function rankMemories(task: TaskInput, memories: MemoryRecord[], limit = BRIEFING_MAX_ITEMS): RankedMemory[] {
  return memories
    .filter((memory) => memory.status === 'active')
    .map((memory) => {
      const scope = scopeScore(task, memory.scope_type, memory.scope_value);
      const evidence = scoreEvidence(memory.evidence_refs);
      const relevance = clampScore(scope * 0.45 + memory.confidence * 0.25 + memory.importance * 0.2 + evidence * 0.1);

      return {
        memory,
        relevance,
        category: categoryForMemory(memory),
      };
    })
    .filter((entry) => entry.relevance >= 0.2)
    .sort((left, right) => right.relevance - left.relevance || right.memory.importance - left.memory.importance)
    .slice(0, limit);
}
