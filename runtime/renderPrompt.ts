const PLACEHOLDER_PATTERN = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;

export type PromptValues = Record<string, unknown>;

function serializePromptValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value, null, 2);
}

export function listPlaceholders(template: string): string[] {
  const placeholders = new Set<string>();

  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
    placeholders.add(match[1]);
  }

  return [...placeholders];
}

export function renderPrompt(template: string, values: PromptValues): string {
  const placeholders = listPlaceholders(template);
  const missingPlaceholders = placeholders.filter((placeholder) => !(placeholder in values));

  if (missingPlaceholders.length > 0) {
    throw new Error(`Missing prompt values for: ${missingPlaceholders.join(', ')}`);
  }

  const renderedPrompt = template.replaceAll(PLACEHOLDER_PATTERN, (_, placeholder: string) => {
    return serializePromptValue(values[placeholder]);
  });
  const unresolvedPlaceholders = listPlaceholders(renderedPrompt);

  if (unresolvedPlaceholders.length > 0) {
    throw new Error(`Prompt still contains unresolved placeholders: ${unresolvedPlaceholders.join(', ')}`);
  }

  return renderedPrompt;
}
