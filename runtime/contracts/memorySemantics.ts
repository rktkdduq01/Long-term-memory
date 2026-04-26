import type { MemoryKind, MemoryType } from './types.ts';

export const MEMORY_TYPES_BY_KIND: Record<MemoryKind, readonly MemoryType[]> = {
  project: ['repo_rule', 'project_constraint', 'approval_boundary', 'unresolved_risk'],
  procedural: ['procedure', 'success_pattern', 'failure_lesson', 'approval_boundary'],
  semantic: ['user_preference', 'repo_rule', 'session_fact'],
  episodic: ['session_fact', 'failure_lesson', 'unresolved_risk'],
};

export function isMemoryTypeAllowedForKind(kind: MemoryKind, memoryType: MemoryType): boolean {
  return MEMORY_TYPES_BY_KIND[kind].includes(memoryType);
}

export function memoryKindTypeWarning(label: string, kind: MemoryKind, memoryType: MemoryType): string | null {
  if (isMemoryTypeAllowedForKind(kind, memoryType)) {
    return null;
  }

  return `${label}: memory_type "${memoryType}" is not recommended for kind "${kind}"; expected one of: ${MEMORY_TYPES_BY_KIND[kind].join(', ')}`;
}
