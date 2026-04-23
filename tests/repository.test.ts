import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import { getRepoRoot } from '../runtime/loadPrompt.ts';
import { validateJson, validateJsonFile } from '../runtime/validateJson.ts';

const repoRoot = getRepoRoot();
const promptsDir = resolve(repoRoot, 'prompts');
const schemasDir = resolve(repoRoot, 'schemas');
const examplesDir = resolve(repoRoot, 'examples');
const agentsPath = resolve(repoRoot, 'AGENTS.md');

const BASE_PROMPT_REQUIREMENT = /This prompt must be executed with `?prompts\/base-memory-harness\.md`? prepended\./;
const RAW_JSON_REQUIREMENT = 'Return raw JSON only';

const PROMPT_PLACEHOLDER_CONTRACTS: Record<string, string[]> = {
  'apply-user-memory-correction.md': ['affected_memories', 'current_task_context', 'user_correction_request'],
  'base-memory-harness.md': [],
  'consolidate-semantic-memories.md': ['semantic_memories'],
  'decide-semantic-promotion.md': ['candidates', 'existing_semantic_memories'],
  'distill-session-memory.md': ['session_timeline', 'user_request', 'user_signals', 'validation_results'],
  'extract-ci-failure-memory.md': [
    'branch',
    'changed_files',
    'ci_workflow_name',
    'commit_sha',
    'failed_jobs',
    'failure_logs',
    'task_context',
  ],
  'extract-candidate-memories.md': ['session_events', 'user_request'],
  'github-automation-gate.md': [
    'changed_files',
    'local_validation_results',
    'memory_changes',
    'risk_assessment',
    'target_branch',
    'task_summary',
  ],
  'manage-memory-decay.md': ['semantic_memories', 'usage_history'],
  'prepare-task-memory-briefing.md': ['selected_memories', 'user_request'],
  'resolve-memory-conflicts.md': ['existing_memories', 'new_candidates'],
  'select-memories-for-task.md': ['episodic_memories', 'semantic_memories', 'task_metadata', 'user_request'],
};

const JSON_PROMPTS = new Set(
  Object.keys(PROMPT_PLACEHOLDER_CONTRACTS).filter((promptName) => promptName !== 'base-memory-harness.md'),
);

const PROMPT_EXCLUSIONS: Record<string, string> = {};

const OUTPUT_EXAMPLE_SCHEMA_PAIRS = [
  ['sample-selection-output.json', 'schemas/memory-selection.schema.json'],
  ['sample-briefing-output.json', 'schemas/memory-briefing.schema.json'],
  ['sample-candidate-output.json', 'schemas/extract-candidate-memories.schema.json'],
  ['sample-promotion-output.json', 'schemas/promotion-decision.schema.json'],
] as const;

function extractPromptPathsFromAgents(content: string): string[] {
  return [...content.matchAll(/`(prompts\/[^`]+\.md)`/g)].map((match) => match[1]);
}

function extractPlaceholders(content: string): string[] {
  return [...new Set([...content.matchAll(/{{\s*([a-zA-Z0-9_]+)\s*}}/g)].map((match) => match[1]))].sort();
}

async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

test('every prompt listed in AGENTS.md exists on disk', async () => {
  const agentsContent = await readFile(agentsPath, 'utf8');
  const promptPaths = extractPromptPathsFromAgents(agentsContent);

  assert.ok(promptPaths.length > 0, 'AGENTS.md should list at least one prompt.');

  for (const promptPath of promptPaths) {
    const absolutePromptPath = resolve(repoRoot, promptPath);
    const promptContent = await readFile(absolutePromptPath, 'utf8');
    assert.ok(promptContent.length > 0, `${promptPath} should be readable.`);
  }
});

test('every prompt file under prompts/ is listed in AGENTS.md or explicitly excluded', async () => {
  const agentsContent = await readFile(agentsPath, 'utf8');
  const promptPathsInAgents = new Set(extractPromptPathsFromAgents(agentsContent).map((promptPath) => basename(promptPath)));
  const promptFiles = (await readdir(promptsDir)).filter((entry) => entry.endsWith('.md')).sort();

  for (const promptFile of promptFiles) {
    const listedInAgents = promptPathsInAgents.has(promptFile);
    const exclusionReason = PROMPT_EXCLUSIONS[promptFile];

    assert.ok(
      listedInAgents || Boolean(exclusionReason),
      `Prompt ${promptFile} must be listed in AGENTS.md or have an explicit exclusion reason.`,
    );
  }
});

test('schema files in schemas/ are valid JSON', async () => {
  const schemaFiles = (await readdir(schemasDir)).filter((entry) => entry.endsWith('.json')).sort();

  assert.ok(schemaFiles.length > 0, 'schemas/ should contain JSON schema files.');

  for (const schemaFile of schemaFiles) {
    const schemaPath = resolve(schemasDir, schemaFile);
    const rawSchema = await readFile(schemaPath, 'utf8');
    assert.doesNotThrow(() => JSON.parse(rawSchema), `${schemaFile} should parse as valid JSON.`);
  }
});

test('prompt placeholder contracts match the current prompt files', async () => {
  for (const [promptFile, expectedPlaceholders] of Object.entries(PROMPT_PLACEHOLDER_CONTRACTS)) {
    const promptContent = await readFile(resolve(promptsDir, promptFile), 'utf8');
    const actualPlaceholders = extractPlaceholders(promptContent);

    assert.deepEqual(
      actualPlaceholders,
      [...expectedPlaceholders].sort(),
      `${promptFile} placeholders changed. Update tests if the contract changed intentionally.`,
    );
  }
});

test('JSON-returning prompts include raw JSON and schema instructions, and non-base prompts require the base prompt', async () => {
  for (const promptFile of Object.keys(PROMPT_PLACEHOLDER_CONTRACTS)) {
    const promptContent = await readFile(resolve(promptsDir, promptFile), 'utf8');

    if (promptFile !== 'base-memory-harness.md') {
      assert.match(promptContent, BASE_PROMPT_REQUIREMENT, `${promptFile} must declare the base prompt requirement.`);
    }

    if (JSON_PROMPTS.has(promptFile)) {
      assert.match(promptContent, /Output schema:\s*\n`schemas\/[^`]+\.schema\.json`/, `${promptFile} must reference a schema.`);
      assert.match(promptContent, /Return raw JSON only/, `${promptFile} must require raw JSON output.`);
    } else {
      assert.ok(!promptContent.includes(RAW_JSON_REQUIREMENT), `${promptFile} should not declare raw JSON output.`);
    }
  }
});

test('example output fixtures conform to their schemas', async () => {
  for (const [exampleFile, schemaRelativePath] of OUTPUT_EXAMPLE_SCHEMA_PAIRS) {
    const result = await validateJsonFile(resolve(examplesDir, exampleFile), resolve(repoRoot, schemaRelativePath));
    assert.equal(result.valid, true, `${exampleFile} should validate: ${result.errors.join('; ')}`);
  }
});

test('semantic and episodic example inputs conform to their canonical schemas', async () => {
  const semanticMemories = await readJsonFile<unknown[]>(resolve(examplesDir, 'sample-semantic-memories.json'));
  const episodicMemories = await readJsonFile<unknown[]>(resolve(examplesDir, 'sample-episodic-memories.json'));
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
