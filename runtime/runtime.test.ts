import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { buildBriefing } from './buildBriefing.ts';
import { extractCandidates } from './extractCandidates.ts';
import { getRepoRoot, loadPrompt } from './loadPrompt.ts';
import { loadMemoryInputs } from './memoryStore.ts';
import { selectTopMemories } from './rankMemories.ts';
import { listPlaceholders, renderPrompt } from './renderPrompt.ts';
import { runSessionDistillation } from './sessionDistill.ts';
import { validateJson, validateJsonFile } from './validateJson.ts';
import { createMemoryOutputRetryInstruction, validateMemoryOutput } from './validateMemoryOutput.ts';

const repoRoot = getRepoRoot();

async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

test('loadPrompt prepends the base prompt automatically', async () => {
  const loadedPrompt = await loadPrompt('select-memories-for-task.md', repoRoot);

  assert.ok(loadedPrompt.combinedPrompt.startsWith(loadedPrompt.basePrompt.trimEnd()));
  assert.match(loadedPrompt.combinedPrompt, /# Base Memory Harness/);
  assert.match(loadedPrompt.combinedPrompt, /# Select Memories For Task/);
});

test('renderPrompt lists and replaces placeholders', () => {
  const template = 'Task: {{user_request}}\nMemories: {{semantic_memories}}';
  assert.deepEqual(listPlaceholders(template), ['user_request', 'semantic_memories']);

  const rendered = renderPrompt(template, {
    user_request: 'Validate prompt rendering.',
    semantic_memories: [{ memory_id: 'mem_1' }],
  });

  assert.match(rendered, /Validate prompt rendering\./);
  assert.match(rendered, /"memory_id": "mem_1"/);
});

test('renderPrompt throws when placeholders are missing', () => {
  assert.throws(() => {
    renderPrompt('Task: {{user_request}}\nMetadata: {{task_metadata}}', {
      user_request: 'Only one value supplied.',
    });
  }, /Missing prompt values for: task_metadata/);
});

test('validateJson accepts a valid sample selection output', async () => {
  const selectionOutputPath = resolve(repoRoot, 'runtime/samples/selection-output.json');
  const selectionSchemaPath = resolve(repoRoot, 'schemas/memory-selection.schema.json');
  const result = await validateJsonFile(selectionOutputPath, selectionSchemaPath);

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('validateJson rejects malformed selection output', async () => {
  const selectionSchemaPath = resolve(repoRoot, 'schemas/memory-selection.schema.json');
  const invalidSelectionOutput = {
    selected_semantic_ids: ['mem_repo_schema_rule'],
    selected_episodic_ids: [],
    notes: [
      {
        memory_id: 'mem_repo_schema_rule',
        memory_kind: 'semantic',
        why_it_matters_now: 'Still relevant.',
        relevance_to_task: 1.2,
        confidence: 0.9,
        evidence_refs: [],
      },
    ],
  };

  const result = await validateJson(invalidSelectionOutput, selectionSchemaPath);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('<= 1')));
  assert.ok(result.errors.some((error) => error.includes('at least 1 items')));
});

test('validateMemoryOutput accepts valid raw JSON that matches the schema', async () => {
  const rawOutput = await readFile(resolve(repoRoot, 'examples/sample-candidate-output.json'), 'utf8');
  const schemaPath = resolve(repoRoot, 'schemas/extract-candidate-memories.schema.json');
  const result = await validateMemoryOutput<{ candidates: unknown[] }>(rawOutput, schemaPath);

  assert.equal(result.valid, true);
  if (result.valid) {
    assert.ok(Array.isArray(result.parsed.candidates));
    assert.ok(result.parsed.candidates.length >= 1);
  }
});

test('validateMemoryOutput rejects markdown fenced JSON by default', async () => {
  const rawOutput = `\`\`\`json\n${await readFile(resolve(repoRoot, 'examples/sample-candidate-output.json'), 'utf8')}\n\`\`\``;
  const schemaPath = resolve(repoRoot, 'schemas/extract-candidate-memories.schema.json');
  const result = await validateMemoryOutput(rawOutput, schemaPath);

  assert.equal(result.valid, false);
  if (!result.valid) {
    assert.ok(result.errors.some((error) => error.includes('Markdown fenced JSON')));
  }
});

test('validateMemoryOutput can optionally accept a single fenced JSON block', async () => {
  const rawOutput = `\`\`\`json\n${await readFile(resolve(repoRoot, 'examples/sample-candidate-output.json'), 'utf8')}\n\`\`\``;
  const schemaPath = resolve(repoRoot, 'schemas/extract-candidate-memories.schema.json');
  const result = await validateMemoryOutput(rawOutput, schemaPath, {
    allowMarkdownFences: true,
  });

  assert.equal(result.valid, true);
});

test('validateMemoryOutput fails on invalid JSON with a readable parse error', async () => {
  const rawOutput = '{"candidates":[{"candidate_id":"cand_broken",}]}';
  const schemaPath = resolve(repoRoot, 'schemas/extract-candidate-memories.schema.json');
  const result = await validateMemoryOutput(rawOutput, schemaPath);

  assert.equal(result.valid, false);
  if (!result.valid) {
    assert.ok(result.errors.some((error) => error.startsWith('Invalid JSON:')));
  }
});

test('validateMemoryOutput fails on schema mismatches including unexpected fields', async () => {
  const rawOutput = JSON.stringify({
    candidates: [
      {
        candidate_id: 'cand_invalid',
        type: 'repo_rule',
        gist: 'Broken candidate for validation testing.',
        fact_or_inference: 'fact',
        status: 'candidate',
        scope_type: 'repo',
        scope_value: 'rktkdduq01/Long-term-memory',
        confidence: 0.8,
        future_usefulness: 0.7,
        evidence_refs: [
          {
            source_type: 'user_message',
            source_id: 'user-turn-test',
            quote_or_summary: 'Test evidence.',
            observed_at: '2026-04-23T00:00:00Z',
            trust_level: 'trusted',
          },
        ],
        source_trust_level: 'trusted',
        sensitivity: 'internal',
        why_keep: 'Schema gate should reject the unexpected field below.',
        extra_field: 'not allowed',
      },
    ],
  });
  const schemaPath = resolve(repoRoot, 'schemas/extract-candidate-memories.schema.json');
  const result = await validateMemoryOutput(rawOutput, schemaPath);

  assert.equal(result.valid, false);
  if (!result.valid) {
    assert.ok(result.errors.some((error) => error.includes('unexpected property "extra_field"')));
  }
});

test('createMemoryOutputRetryInstruction reports validation failures without mutating output', () => {
  const retryInstruction = createMemoryOutputRetryInstruction({
    schemaPath: 'schemas/extract-candidate-memories.schema.json',
    errors: ['$.candidates/0: unexpected property "extra_field".'],
  });

  assert.match(retryInstruction, /Return raw JSON only/);
  assert.match(retryInstruction, /unexpected property "extra_field"/);
});

test('deterministic ranking respects retrieval budgets', async () => {
  const { task, semanticMemories, episodicMemories } = await loadMemoryInputs({
    repoRoot,
    useExamples: true,
  });
  const selected = selectTopMemories(task, semanticMemories, episodicMemories);

  assert.ok(selected.semantic.length <= 5);
  assert.ok(selected.episodic.length <= 3);
  assert.ok(selected.semantic.every((entry) => ['promoted', 'stable', 'fading'].includes(entry.memory.status)));
  assert.ok(selected.episodic.every((entry) => entry.memory.status === 'observed'));
});

test('buildBriefing produces schema-valid briefing output from example data', async () => {
  const result = await buildBriefing({
    repoRoot,
    useExamples: true,
  });
  const briefingSchemaPath = resolve(repoRoot, 'schemas/memory-briefing.schema.json');
  const validation = await validateJson(result.briefing, briefingSchemaPath);

  assert.equal(validation.valid, true, validation.errors.join('; '));
  assert.ok(result.selected_semantic_ids.length <= 5);
  assert.ok(result.selected_episodic_ids.length <= 3);
  assert.ok(result.briefing.rendered_briefing.length <= 200);
  assert.ok(result.briefing.hard_rules.length >= 1);
  assert.equal(result.output_path, null);
});

test('buildBriefing can write briefing output to .memory or a custom path', async () => {
  const outputPath = '.memory/test-briefing.json';
  const result = await buildBriefing({
    repoRoot,
    useExamples: true,
    writeOutput: true,
    outputPath,
  });
  const absoluteOutputPath = resolve(repoRoot, outputPath);
  const storedBriefing = await readJsonFile<Record<string, unknown>>(absoluteOutputPath);
  const briefingSchemaPath = resolve(repoRoot, 'schemas/memory-briefing.schema.json');
  const validation = await validateJson(storedBriefing, briefingSchemaPath);

  assert.equal(result.output_path, absoluteOutputPath);
  assert.equal(validation.valid, true, validation.errors.join('; '));
  await rm(absoluteOutputPath, { force: true });
});

test('runSessionDistillation produces schema-valid output from sample session events', async () => {
  const result = await runSessionDistillation({
    repoRoot,
    sessionPath: 'examples/sample-session-events.json',
  });
  const schemaPath = resolve(repoRoot, 'schemas/session-distillation.schema.json');
  const validation = await validateJson(result, schemaPath);

  assert.equal(validation.valid, true, validation.errors.join('; '));
  assert.ok(result.durable_candidates.length >= 1);
  assert.ok(result.key_takeaways.length <= 3);
  assert.ok(
    result.durable_candidates.every((candidate) => candidate.evidence_refs.length >= 1),
    'durable candidates should retain structured evidence refs',
  );
  assert.ok(
    result.durable_candidates.every(
      (candidate) => candidate.scope_type.length > 0 && candidate.scope_value.length > 0,
    ),
    'durable candidates should carry normalized scope fields',
  );
});

test('extractCandidates produces schema-valid candidate output with structured evidence and normalized scope', async () => {
  const { result, output_path } = await extractCandidates({
    repoRoot,
    sessionPath: 'examples/sample-session-events.json',
  });
  const schemaPath = resolve(repoRoot, 'schemas/extract-candidate-memories.schema.json');
  const validation = await validateJson(result, schemaPath);

  assert.equal(validation.valid, true, validation.errors.join('; '));
  assert.equal(output_path, null);
  assert.ok(result.candidates.length >= 1);
  assert.ok(result.candidates.some((candidate) => candidate.status === 'held'));
  assert.ok(
    result.candidates.every((candidate) =>
      candidate.evidence_refs.every(
        (evidence) =>
          typeof evidence.source_type === 'string' &&
          typeof evidence.source_id === 'string' &&
          typeof evidence.quote_or_summary === 'string' &&
          typeof evidence.observed_at === 'string' &&
          typeof evidence.trust_level === 'string',
      ),
    ),
    'candidate evidence refs should use the structured evidence object shape',
  );
  assert.ok(
    result.candidates.every(
      (candidate) => candidate.scope_type.length > 0 && candidate.scope_value.length > 0,
    ),
    'candidate memories should use normalized scope_type and scope_value fields',
  );
});

test('extractCandidates can write candidate output to .memory or a custom path', async () => {
  const outputPath = '.memory/test-candidate-memories.json';
  const { output_path } = await extractCandidates({
    repoRoot,
    sessionPath: 'examples/sample-session-events.json',
    outputPath,
    writeOutput: true,
  });
  const absoluteOutputPath = resolve(repoRoot, outputPath);
  const storedCandidates = await readJsonFile<Record<string, unknown>>(absoluteOutputPath);
  const schemaPath = resolve(repoRoot, 'schemas/extract-candidate-memories.schema.json');
  const validation = await validateJson(storedCandidates, schemaPath);

  assert.equal(output_path, absoluteOutputPath);
  assert.equal(validation.valid, true, validation.errors.join('; '));
  await rm(absoluteOutputPath, { force: true });
});

test('example semantic and episodic fixtures conform to their canonical schemas', async () => {
  const semanticMemories = await readJsonFile<unknown[]>(resolve(repoRoot, 'examples/sample-semantic-memories.json'));
  const episodicMemories = await readJsonFile<unknown[]>(resolve(repoRoot, 'examples/sample-episodic-memories.json'));
  const semanticSchemaPath = resolve(repoRoot, 'schemas/semantic-memory.schema.json');
  const episodicSchemaPath = resolve(repoRoot, 'schemas/episodic-memory.schema.json');

  for (const [index, memory] of semanticMemories.entries()) {
    const result = await validateJson(memory, semanticSchemaPath);
    assert.equal(result.valid, true, `semantic example ${index} should validate: ${result.errors.join('; ')}`);
  }

  for (const [index, memory] of episodicMemories.entries()) {
    const result = await validateJson(memory, episodicSchemaPath);
    assert.equal(result.valid, true, `episodic example ${index} should validate: ${result.errors.join('; ')}`);
  }
});

test('schema-backed lifecycle examples validate against their output schemas', async () => {
  const examplePairs = [
    ['examples/sample-selection-output.json', 'schemas/memory-selection.schema.json'],
    ['examples/sample-briefing-output.json', 'schemas/memory-briefing.schema.json'],
    ['examples/sample-candidate-output.json', 'schemas/extract-candidate-memories.schema.json'],
    ['examples/sample-promotion-output.json', 'schemas/promotion-decision.schema.json'],
  ] as const;

  for (const [jsonRelativePath, schemaRelativePath] of examplePairs) {
    const result = await validateJsonFile(resolve(repoRoot, jsonRelativePath), resolve(repoRoot, schemaRelativePath));
    assert.equal(result.valid, true, `${jsonRelativePath} should validate: ${result.errors.join('; ')}`);
  }
});

test('input examples are loadable and contain the expected high-level fields', async () => {
  const sampleTask = await readJsonFile<Record<string, unknown>>(resolve(repoRoot, 'examples/sample-task.json'));
  const sessionEvents = await readJsonFile<Array<Record<string, unknown>>>(resolve(repoRoot, 'examples/sample-session-events.json'));

  assert.equal(typeof sampleTask.user_request, 'string');
  assert.equal(typeof sampleTask.task_metadata, 'object');
  assert.ok(Array.isArray(sessionEvents));
  assert.ok(sessionEvents.length >= 3);
  assert.ok(sessionEvents.every((event) => typeof event.event_id === 'string'));
});
