import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getRepoRoot } from './loadPrompt.ts';
import { loadMemoryInputs, writeBriefingOutput } from './memoryStore.ts';
import type { EpisodicMemoryRecord, SemanticMemoryRecord, TaskInput } from './memoryStore.ts';
import { selectTopMemories } from './rankMemories.ts';
import { validateJson } from './validateJson.ts';

export interface MemoryBriefing {
  hard_rules: string[];
  soft_preferences: string[];
  recent_cautions: string[];
  uncertainties: string[];
  conflicts: string[];
  rendered_briefing: string;
}

export interface BuildBriefingResult {
  briefing: MemoryBriefing;
  selected_semantic_ids: string[];
  selected_episodic_ids: string[];
  output_path: string | null;
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function toSentence(text: string): string {
  const trimmed = text.trim();

  if (!trimmed) {
    return '';
  }

  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function deriveHardRules(memories: SemanticMemoryRecord[]): string[] {
  return dedupeStrings(
    memories
      .filter((memory) => ['repo_rule', 'project_constraint', 'approval_boundary', 'exception_rule'].includes(memory.type))
      .filter((memory) => memory.confidence >= 0.75)
      .filter((memory) => memory.status !== 'fading')
      .filter((memory) => !memory.conflicts_with.some((conflict) => conflict.conflict_status === 'active'))
      .map((memory) => toSentence(memory.gist)),
  );
}

function deriveSoftPreferences(memories: SemanticMemoryRecord[]): string[] {
  return dedupeStrings(
    memories
      .filter((memory) => memory.type === 'user_preference')
      .map((memory) => toSentence(memory.gist)),
  );
}

function deriveRecentCautions(
  semanticMemories: SemanticMemoryRecord[],
  episodicMemories: EpisodicMemoryRecord[],
): string[] {
  return dedupeStrings([
    ...semanticMemories
      .filter((memory) => memory.type === 'failure_lesson')
      .map((memory) => toSentence(memory.gist)),
    ...episodicMemories
      .filter((memory) => ['validation_result', 'error', 'review_feedback'].includes(memory.event_type))
      .map((memory) => toSentence(memory.summary)),
  ]);
}

function deriveUncertainties(memories: SemanticMemoryRecord[]): string[] {
  return dedupeStrings(
    memories
      .filter((memory) => memory.confidence < 0.65 || memory.status === 'fading')
      .map((memory) => toSentence(`Treat cautiously: ${memory.gist}`)),
  );
}

function deriveConflicts(memories: SemanticMemoryRecord[]): string[] {
  return dedupeStrings(
    memories.flatMap((memory) =>
      memory.conflicts_with
        .filter((conflict) => conflict.conflict_status === 'active')
        .map((conflict) => toSentence(conflict.note)),
    ),
  );
}

function buildRenderedBriefing(briefing: Omit<MemoryBriefing, 'rendered_briefing'>): string {
  const sections: string[] = [];

  if (briefing.hard_rules.length > 0) {
    sections.push(`Hard rules: ${briefing.hard_rules.slice(0, 2).join(' ')}`);
  }

  if (briefing.soft_preferences.length > 0) {
    sections.push(`Preferences: ${briefing.soft_preferences.slice(0, 2).join(' ')}`);
  }

  if (briefing.recent_cautions.length > 0) {
    sections.push(`Cautions: ${briefing.recent_cautions.slice(0, 2).join(' ')}`);
  }

  if (briefing.uncertainties.length > 0) {
    sections.push(`Uncertainties: ${briefing.uncertainties.slice(0, 1).join(' ')}`);
  }

  if (briefing.conflicts.length > 0) {
    sections.push(`Conflicts: ${briefing.conflicts.slice(0, 1).join(' ')}`);
  }

  return sections.join(' ').slice(0, 200);
}

export function createBriefingFromSelection(
  task: TaskInput,
  semanticMemories: SemanticMemoryRecord[],
  episodicMemories: EpisodicMemoryRecord[],
): MemoryBriefing {
  const briefingWithoutRender = {
    hard_rules: deriveHardRules(semanticMemories),
    soft_preferences: deriveSoftPreferences(semanticMemories),
    recent_cautions: deriveRecentCautions(semanticMemories, episodicMemories),
    uncertainties: deriveUncertainties(semanticMemories),
    conflicts: deriveConflicts(semanticMemories),
  };
  const rendered_briefing = buildRenderedBriefing(briefingWithoutRender) || toSentence(task.user_request);

  return {
    ...briefingWithoutRender,
    rendered_briefing,
  };
}

export async function buildBriefing(options?: {
  repoRoot?: string;
  taskPath?: string;
  useExamples?: boolean;
  outputPath?: string;
  writeOutput?: boolean;
}): Promise<BuildBriefingResult> {
  const repoRoot = options?.repoRoot ?? getRepoRoot();
  const { task, semanticMemories, episodicMemories } = await loadMemoryInputs({
    repoRoot,
    taskPath: options?.taskPath,
    useExamples: options?.useExamples,
  });
  const selected = selectTopMemories(task, semanticMemories, episodicMemories);
  const briefing = createBriefingFromSelection(
    task,
    selected.semantic.map((entry) => entry.memory),
    selected.episodic.map((entry) => entry.memory),
  );
  const validationResult = await validateJson(briefing, resolve(repoRoot, 'schemas/memory-briefing.schema.json'));

  if (!validationResult.valid) {
    throw new Error(`Briefing output failed validation:\n${validationResult.errors.join('\n')}`);
  }

  let output_path: string | null = null;

  if (options?.writeOutput) {
    output_path = await writeBriefingOutput(briefing, {
      repoRoot,
      outputPath: options.outputPath,
    });
  }

  return {
    briefing,
    selected_semantic_ids: selected.semantic.map((entry) => entry.memory.memory_id),
    selected_episodic_ids: selected.episodic.map((entry) => entry.memory.episode_id),
    output_path,
  };
}

function parseCliArgs(argv: string[]) {
  const parsed = {
    taskPath: undefined as string | undefined,
    outputPath: undefined as string | undefined,
    useExamples: false,
    writeOutput: false,
    stdout: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    switch (argument) {
      case '--task':
        parsed.taskPath = argv[index + 1];
        index += 1;
        break;
      case '--output':
        parsed.outputPath = argv[index + 1];
        parsed.writeOutput = true;
        parsed.stdout = false;
        index += 1;
        break;
      case '--write':
        parsed.writeOutput = true;
        parsed.stdout = false;
        break;
      case '--use-examples':
        parsed.useExamples = true;
        break;
      case '--stdout':
        parsed.stdout = true;
        break;
      default:
        break;
    }
  }

  return parsed;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const parsedArgs = parseCliArgs(process.argv.slice(2));
  const result = await buildBriefing({
    taskPath: parsedArgs.taskPath,
    outputPath: parsedArgs.outputPath,
    useExamples: parsedArgs.useExamples,
    writeOutput: parsedArgs.writeOutput,
  });

  if (parsedArgs.stdout) {
    process.stdout.write(`${JSON.stringify(result.briefing, null, 2)}\n`);
  } else if (result.output_path) {
    process.stdout.write(`${result.output_path}\n`);
  }
}
