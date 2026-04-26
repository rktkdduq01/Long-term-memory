import type { MemoryRecord, ScopeType, TaskInput } from '../contracts/types.ts';

function includesText(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

export function scopeScore(task: TaskInput, scopeType: ScopeType, scopeValue: string): number {
  if (scopeType === task.scope_type && scopeValue === task.scope_value) {
    return 1;
  }

  switch (scopeType) {
    case 'repo':
      return task.repo === scopeValue ? 1 : includesText(task.repo, scopeValue) ? 0.85 : 0.2;
    case 'branch':
      return task.branch && includesText(task.branch, scopeValue) ? 0.75 : 0.1;
    case 'directory':
    case 'file':
      return includesText(task.user_request, scopeValue) ? 0.85 : 0.25;
    case 'task_type': {
      const taskType = typeof task.metadata.task_type === 'string' ? task.metadata.task_type : '';
      return taskType === scopeValue ? 1 : includesText(taskType, scopeValue) ? 0.75 : 0.15;
    }
    case 'global_user':
      return 0.55;
    case 'session':
      return task.scope_type === 'session' && task.scope_value === scopeValue ? 1 : 0.1;
  }
}

export function filterByScope(task: TaskInput, memories: MemoryRecord[], minimumScore = 0.2): MemoryRecord[] {
  return memories.filter((memory) => scopeScore(task, memory.scope_type, memory.scope_value) >= minimumScore);
}
