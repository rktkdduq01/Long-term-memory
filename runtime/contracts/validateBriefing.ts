import { resolve } from 'node:path';

import { BRIEFING_MAX_ITEMS, BRIEFING_MAX_WORDS } from './constants.ts';
import type { Briefing } from './types.ts';
import { getRepoRoot } from '../loadPrompt.ts';
import { validateJson } from '../validateJson.ts';

function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export async function validateBriefing(briefing: unknown, repoRoot = getRepoRoot()): Promise<string[]> {
  const result = await validateJson(briefing, resolve(repoRoot, 'schemas/briefing.schema.json'));
  const errors = [...result.errors];

  if (typeof briefing === 'object' && briefing !== null && !Array.isArray(briefing)) {
    const candidate = briefing as Partial<Briefing>;

    if (candidate.max_words !== BRIEFING_MAX_WORDS) {
      errors.push(`$.max_words: expected shared limit ${BRIEFING_MAX_WORDS}.`);
    }

    if (candidate.max_items !== BRIEFING_MAX_ITEMS) {
      errors.push(`$.max_items: expected shared limit ${BRIEFING_MAX_ITEMS}.`);
    }

    if (Array.isArray(candidate.items) && candidate.items.length > BRIEFING_MAX_ITEMS) {
      errors.push(`$.items: must contain at most ${BRIEFING_MAX_ITEMS} items.`);
    }

    if (typeof candidate.rendered_briefing === 'string' && countWords(candidate.rendered_briefing) > BRIEFING_MAX_WORDS) {
      errors.push(`$.rendered_briefing: must contain at most ${BRIEFING_MAX_WORDS} words.`);
    }
  }

  return errors;
}

export async function assertValidBriefing(briefing: unknown, repoRoot = getRepoRoot()): Promise<Briefing> {
  const errors = await validateBriefing(briefing, repoRoot);

  if (errors.length > 0) {
    throw new Error(`Briefing failed validation:\n${errors.join('\n')}`);
  }

  return briefing as Briefing;
}
