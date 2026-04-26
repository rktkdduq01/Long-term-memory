import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import { BRIEFING_MAX_ITEMS, BRIEFING_MAX_WORDS, MEMORY_STORE_FILES, SCORE_MAX, SCORE_MIN } from '../runtime/contracts/constants.ts';
import { sampleCandidates } from '../runtime/reference/sampleCandidates.ts';
import { sampleMemories, sampleSessionEvents, sampleTask } from '../runtime/reference/sampleBriefing.ts';
import { getRepoRoot } from '../runtime/loadPrompt.ts';
import { validateJson } from '../runtime/validateJson.ts';

const repoRoot = getRepoRoot();
const promptsDir = resolve(repoRoot, 'prompts');
const schemasDir = resolve(repoRoot, 'schemas');
const agentsPath = resolve(repoRoot, 'AGENTS.md');
const readmePath = resolve(repoRoot, 'README.md');
const packagePath = resolve(repoRoot, 'package.json');

const EXPECTED_PROMPTS = [
  'base-memory-harness.md',
  'local-memory-search.md',
  'memory-approval.md',
  'memory-conflict-check.md',
  'post-task-distillation.md',
  'pre-task-briefing.md',
] as const;

const EXPECTED_SCHEMAS = [
  'approval-event.schema.json',
  'briefing.schema.json',
  'memory-candidate.schema.json',
  'memory.schema.json',
  'session-event.schema.json',
  'task.schema.json',
] as const;

const PROMPT_PLACEHOLDERS: Record<string, string[]> = {
  'base-memory-harness.md': [],
  'local-memory-search.md': ['approved_memories', 'now', 'pending_candidates', 'query', 'repo_scope'],
  'memory-approval.md': ['approved_memories', 'conflict_report', 'now', 'pending_candidates', 'repo_scope'],
  'memory-conflict-check.md': ['approved_memories', 'now', 'pending_candidates', 'repo_scope'],
  'post-task-distillation.md': [
    'approved_memories',
    'existing_candidates',
    'now',
    'repo_scope',
    'session_events',
    'task',
  ],
  'pre-task-briefing.md': [
    'approved_memories',
    'conflicted_memories',
    'now',
    'pending_candidates',
    'repo_scope',
    'task',
  ],
};

function extractPromptPathsFromAgents(content: string): string[] {
  return [...content.matchAll(/`(prompts\/[^`]+\.md)`/g)].map((match) => match[1]);
}

function extractPlaceholders(content: string): string[] {
  return [...new Set([...content.matchAll(/{{\s*([a-zA-Z0-9_]+)\s*}}/g)].map((match) => match[1]))].sort();
}

async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

test('prompt and schema inventories match the local-only contract', async () => {
  const promptFiles = (await readdir(promptsDir)).filter((entry) => entry.endsWith('.md')).sort();
  const schemaFiles = (await readdir(schemasDir)).filter((entry) => entry.endsWith('.json')).sort();

  assert.deepEqual(promptFiles, [...EXPECTED_PROMPTS].sort());
  assert.deepEqual(schemaFiles, [...EXPECTED_SCHEMAS].sort());
});

test('AGENTS.md lists every active prompt and the Codex CLI scripts', async () => {
  const agentsContent = await readFile(agentsPath, 'utf8');
  const promptPaths = [...new Set(extractPromptPathsFromAgents(agentsContent).map((promptPath) => basename(promptPath)))].sort();

  assert.deepEqual(promptPaths, [...EXPECTED_PROMPTS].sort());
  for (const script of ['memory:briefing', 'memory:search', 'memory:candidates', 'memory:approve', 'memory:reject', 'memory:validate']) {
    assert.match(agentsContent, new RegExp(script.replace(':', ':')));
  }
  assert.match(agentsContent, /Permanent memory must never be written automatically/);
  assert.match(agentsContent, /Strict local mode is default/);
});

test('README states the local-only product boundary and JSONL store layout', async () => {
  const readme = await readFile(readmePath, 'utf8');

  for (const phrase of [
    'Local-only long-term memory harness for Codex CLI',
    'This repository provides prompt contracts, JSON schemas, local runtime helpers, and CLI commands',
    'start a server',
    'expose an MCP server',
    'background daemon',
    'require network access',
    'Permanent memory is never written automatically',
    'Demo mode is available only when explicitly requested',
  ]) {
    assert.match(readme, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  for (const storePath of Object.values(MEMORY_STORE_FILES)) {
    assert.match(readme, new RegExp(storePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('prompt placeholder contracts and JSON instructions stay aligned', async () => {
  for (const [promptFile, expectedPlaceholders] of Object.entries(PROMPT_PLACEHOLDERS)) {
    const promptContent = await readFile(resolve(promptsDir, promptFile), 'utf8');
    assert.deepEqual(extractPlaceholders(promptContent), expectedPlaceholders);

    if (promptFile === 'base-memory-harness.md') {
      assert.doesNotMatch(promptContent, /Return raw JSON only/);
    } else {
      assert.match(promptContent, /This prompt must be executed with `prompts\/base-memory-harness\.md` prepended\./);
      assert.match(promptContent, /Return raw JSON only\. Do not wrap the output in markdown fences\./);
      assert.match(promptContent, /schemas\/[a-z-]+\.schema\.json/);
    }
  }
});

test('canonical schema files parse and use strict root object contracts', async () => {
  for (const schemaFile of EXPECTED_SCHEMAS) {
    const schema = await readJsonFile<Record<string, unknown>>(resolve(schemasDir, schemaFile));

    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(schema.type, 'object');
    assert.equal(schema.additionalProperties, false);
    assert.ok(Array.isArray(schema.required));
  }
});

test('shared constants match prompt and schema constraints', async () => {
  assert.equal(BRIEFING_MAX_WORDS, 200);
  assert.equal(BRIEFING_MAX_ITEMS, 8);
  assert.equal(SCORE_MIN, 0);
  assert.equal(SCORE_MAX, 1);

  const briefingPrompt = await readFile(resolve(promptsDir, 'pre-task-briefing.md'), 'utf8');
  const briefingSchema = await readJsonFile<Record<string, any>>(resolve(schemasDir, 'briefing.schema.json'));
  const scoreDef = await readJsonFile<Record<string, any>>(resolve(schemasDir, 'memory.schema.json'));

  assert.match(briefingPrompt, /under 200 words/);
  assert.match(briefingPrompt, /no more than 8 briefing items/);
  assert.equal(briefingSchema.properties.max_words.minimum, BRIEFING_MAX_WORDS);
  assert.equal(briefingSchema.properties.max_items.maximum, BRIEFING_MAX_ITEMS);
  assert.equal(scoreDef.$defs.score.minimum, SCORE_MIN);
  assert.equal(scoreDef.$defs.score.maximum, SCORE_MAX);
});

test('reference samples validate against canonical schemas', async () => {
  for (const memory of sampleMemories) {
    const result = await validateJson(memory, resolve(schemasDir, 'memory.schema.json'));
    assert.equal(result.valid, true, `${memory.memory_id}: ${result.errors.join('; ')}`);
  }

  for (const candidate of sampleCandidates) {
    const result = await validateJson(candidate, resolve(schemasDir, 'memory-candidate.schema.json'));
    assert.equal(result.valid, true, `${candidate.candidate_id}: ${result.errors.join('; ')}`);
  }

  for (const event of sampleSessionEvents) {
    const result = await validateJson(event, resolve(schemasDir, 'session-event.schema.json'));
    assert.equal(result.valid, true, `${event.event_id}: ${result.errors.join('; ')}`);
  }

  const taskResult = await validateJson(sampleTask, resolve(schemasDir, 'task.schema.json'));
  assert.equal(taskResult.valid, true, taskResult.errors.join('; '));
});

test('package scripts expose local Codex CLI entrypoints without server dependencies', async () => {
  const packageJson = await readJsonFile<Record<string, any>>(packagePath);

  for (const script of ['memory:briefing', 'memory:search', 'memory:candidates', 'memory:approve', 'memory:reject', 'memory:validate']) {
    assert.equal(typeof packageJson.scripts[script], 'string');
    assert.match(packageJson.scripts[script], /node --experimental-strip-types runtime\/cli\//);
  }

  const dependencyNames = [
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
  ].join(' ');
  assert.doesNotMatch(dependencyNames, /express|fastify|koa|hono|mcp|openai|vectordb|pinecone|chromadb/i);
});
