import type { EpisodicMemoryRecord, SemanticMemoryRecord, TaskInput } from './memoryStore.ts';

export interface RankedMemory<T> {
  memory: T;
  score: number;
  scopeScore: number;
  recencyScore: number;
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(1, score));
}

function getTaskMetadata(task: TaskInput): Record<string, unknown> {
  return typeof task.task_metadata === 'object' && task.task_metadata !== null
    ? (task.task_metadata as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function scopeMatches(task: TaskInput, scopeType: string, scopeValue: string): number {
  const metadata = getTaskMetadata(task);
  const repo = typeof metadata.repo === 'string' ? metadata.repo : '';
  const branch = typeof metadata.branch === 'string' ? metadata.branch : '';
  const taskType = typeof metadata.task_type === 'string' ? metadata.task_type : '';
  const userRequest = task.user_request.toLowerCase();
  const normalizedScopeValue = scopeValue.toLowerCase();
  const notesText = asStringArray(metadata.notes).join(' ').toLowerCase();

  switch (scopeType) {
    case 'repo':
      return repo === scopeValue ? 1 : repo && repo.includes(scopeValue) ? 0.9 : 0.35;
    case 'branch':
      return branch === scopeValue ? 1 : branch && branch.includes(scopeValue) ? 0.8 : 0.2;
    case 'task_type':
      return taskType === scopeValue ? 1 : taskType && taskType.includes(scopeValue) ? 0.85 : 0.2;
    case 'global_user':
      return 0.75;
    case 'directory':
    case 'file':
      return userRequest.includes(normalizedScopeValue) || notesText.includes(normalizedScopeValue) ? 0.9 : 0.25;
    case 'session':
      return 0.45;
    default:
      return 0.2;
  }
}

function computeRecencyScore(isoTimestamp: string | undefined, now = new Date('2026-04-23T12:00:00Z')): number {
  if (!isoTimestamp) {
    return 0;
  }

  const timestamp = Date.parse(isoTimestamp);

  if (Number.isNaN(timestamp)) {
    return 0;
  }

  const ageInDays = Math.max(0, (now.getTime() - timestamp) / (1000 * 60 * 60 * 24));

  if (ageInDays <= 7) {
    return 1;
  }

  if (ageInDays <= 30) {
    return 0.8;
  }

  if (ageInDays <= 90) {
    return 0.55;
  }

  if (ageInDays <= 180) {
    return 0.3;
  }

  return 0.1;
}

function compareRanked<T>(left: RankedMemory<T>, right: RankedMemory<T>): number {
  return right.score - left.score || right.scopeScore - left.scopeScore || right.recencyScore - left.recencyScore;
}

export function rankSemanticMemories(task: TaskInput, memories: SemanticMemoryRecord[]): RankedMemory<SemanticMemoryRecord>[] {
  return memories
    .filter((memory) => ['promoted', 'stable', 'fading'].includes(memory.status))
    .map((memory) => {
      const scopeScore = scopeMatches(task, memory.scope_type, memory.scope_value);
      const recencyScore = computeRecencyScore(memory.last_confirmed_at || memory.updated_at);
      const statusPenalty = memory.status === 'fading' ? -0.08 : 0;
      const score = clampScore(
        scopeScore * 0.45 +
          memory.confidence * 0.25 +
          memory.importance * 0.2 +
          recencyScore * 0.1 +
          statusPenalty,
      );

      return {
        memory,
        score,
        scopeScore,
        recencyScore,
      };
    })
    .sort(compareRanked);
}

export function rankEpisodicMemories(task: TaskInput, memories: EpisodicMemoryRecord[]): RankedMemory<EpisodicMemoryRecord>[] {
  return memories
    .filter((memory) => memory.status === 'observed')
    .map((memory) => {
      const scopeScore = scopeMatches(task, memory.scope_type, memory.scope_value);
      const recencyScore = computeRecencyScore(memory.created_at);
      const eventBias = ['validation_result', 'error', 'review_feedback'].includes(memory.event_type) ? 0.08 : 0;
      const score = clampScore(scopeScore * 0.55 + recencyScore * 0.35 + eventBias);

      return {
        memory,
        score,
        scopeScore,
        recencyScore,
      };
    })
    .sort(compareRanked);
}

export function selectTopMemories(
  task: TaskInput,
  semanticMemories: SemanticMemoryRecord[],
  episodicMemories: EpisodicMemoryRecord[],
): {
  semantic: RankedMemory<SemanticMemoryRecord>[];
  episodic: RankedMemory<EpisodicMemoryRecord>[];
} {
  return {
    semantic: rankSemanticMemories(task, semanticMemories).slice(0, 5),
    episodic: rankEpisodicMemories(task, episodicMemories).slice(0, 3),
  };
}
