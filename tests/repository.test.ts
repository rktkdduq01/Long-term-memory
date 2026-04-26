import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import { BRIEFING_MAX_ITEMS, BRIEFING_MAX_WORDS, MEMORY_STORE_FILES, SCORE_MAX, SCORE_MIN } from '../runtime/contracts/constants.ts';
import { sampleApprovalReview } from '../runtime/reference/sampleApprovalReview.ts';
import { sampleCandidates } from '../runtime/reference/sampleCandidates.ts';
import { sampleMemories, sampleSessionEvents, sampleTask } from '../runtime/reference/sampleBriefing.ts';
import { getRepoRoot } from '../runtime/loadPrompt.ts';
import { validateJson } from '../runtime/validateJson.ts';

const repoRoot = getRepoRoot();
const promptsDir = resolve(repoRoot, 'prompts');
const schemasDir = resolve(repoRoot, 'schemas');
const memoryExampleDir = resolve(repoRoot, '.memory.example');
const agentsPath = resolve(repoRoot, 'AGENTS.md');
const readmePath = resolve(repoRoot, 'README.md');
const schemasReadmePath = resolve(repoRoot, 'schemas/README.md');
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
  'approval-review.schema.json',
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

const SUPPORTED_LOCAL_SCHEMA_KEYWORDS = [
  '$ref',
  'allOf',
  'if',
  'then',
  'else',
  'type',
  'const',
  'enum',
  'required',
  'additionalProperties: false',
  'properties',
  'items',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'minItems',
  'maxItems',
  'uniqueItems',
  'format: date-time',
] as const;

const SUPPORTED_LOCAL_SCHEMA_KEYWORD_NAMES = new Set(
  SUPPORTED_LOCAL_SCHEMA_KEYWORDS.map((keyword) => keyword.split(':')[0]),
);

const LOCAL_SCHEMA_METADATA_KEYWORDS = new Set(['$schema', '$id', 'title', '$defs']);
const LOCAL_SCHEMA_ALLOWED_KEYWORDS = new Set([
  ...SUPPORTED_LOCAL_SCHEMA_KEYWORD_NAMES,
  ...LOCAL_SCHEMA_METADATA_KEYWORDS,
]);

const UNSUPPORTED_LOCAL_SCHEMA_KEYWORDS = [
  'oneOf',
  'anyOf',
  'not',
  'pattern',
  'patternProperties',
  'dependentRequired',
  'unevaluatedProperties',
] as const;

const MEMORY_EXAMPLE_SCHEMA_BY_FILE: Record<string, string> = {
  'semantic-memories.jsonl': 'memory.schema.json',
  'episodic-memories.jsonl': 'memory.schema.json',
  'procedural-memories.jsonl': 'memory.schema.json',
  'project-memories.jsonl': 'memory.schema.json',
  'candidates/pending.jsonl': 'memory-candidate.schema.json',
  'candidates/approved.jsonl': 'memory-candidate.schema.json',
  'candidates/rejected.jsonl': 'memory-candidate.schema.json',
  'sessions/latest.jsonl': 'session-event.schema.json',
  'audit/memory-events.jsonl': 'approval-event.schema.json',
};

const SENSITIVE_EXAMPLE_PATTERNS = [
  { name: 'API key', pattern: /\b(?:api[_-]?key|access[_-]?key|secret[_-]?key)\s*[:=]/i },
  { name: 'bearer token', pattern: /\bbearer\s+[a-z0-9._-]{16,}/i },
  { name: 'OpenAI-style key', pattern: /\bsk-[a-z0-9_-]{16,}/i },
  { name: 'password assignment', pattern: /\bpassword\s*[:=]/i },
  { name: 'private key block', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/i },
  { name: 'user-specific Windows path', pattern: /\/mnt\/c\/Users\/[^/\s"]+/i },
  { name: 'user-specific home path', pattern: /\/home\/[^/\s"]+/i },
];

function extractPromptPathsFromAgents(content: string): string[] {
  return [...content.matchAll(/`(prompts\/[^`]+\.md)`/g)].map((match) => match[1]);
}

function extractPlaceholders(content: string): string[] {
  return [...new Set([...content.matchAll(/{{\s*([a-zA-Z0-9_]+)\s*}}/g)].map((match) => match[1]))].sort();
}

async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

function parseJsonlLines(path: string, content: string): unknown[] {
  const records: unknown[] = [];

  for (const [index, line] of content.split(/\r?\n/).entries()) {
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    try {
      records.push(JSON.parse(trimmed) as unknown);
    } catch (error) {
      assert.fail(`${path}:${index + 1}: invalid JSONL record: ${(error as Error).message}`);
    }
  }

  return records;
}

function findUnsupportedSchemaKeywords(schemaFile: string, value: unknown, path = '$'): string[] {
  if (typeof value === 'boolean') {
    return [];
  }

  if (typeof value !== 'object' || value === null) {
    return [`${schemaFile} ${path}: schema node must be an object or boolean`];
  }

  const errors: string[] = [];
  const record = value as Record<string, unknown>;

  for (const [key, nestedValue] of Object.entries(record)) {
    const nestedPath = `${path}/${key}`;

    if (!LOCAL_SCHEMA_ALLOWED_KEYWORDS.has(key)) {
      errors.push(`${schemaFile} ${nestedPath}: unsupported local validator keyword "${key}"`);
      continue;
    }

    if (key === 'additionalProperties' && nestedValue !== false) {
      errors.push(`${schemaFile} ${nestedPath}: unsupported local validator keyword "additionalProperties" value; only false is enforced`);
      continue;
    }

    if (key === 'format' && nestedValue !== 'date-time') {
      errors.push(`${schemaFile} ${nestedPath}: unsupported local validator keyword "format" value "${String(nestedValue)}"`);
      continue;
    }

    if (key === 'allOf') {
      if (!Array.isArray(nestedValue)) {
        errors.push(`${schemaFile} ${nestedPath}: unsupported local validator keyword "allOf" value; expected an array`);
        continue;
      }

      for (const [index, nestedSchema] of nestedValue.entries()) {
        errors.push(...findUnsupportedSchemaKeywords(schemaFile, nestedSchema, `${nestedPath}/${index}`));
      }
      continue;
    }

    if (key === 'properties' || key === '$defs') {
      if (typeof nestedValue !== 'object' || nestedValue === null || Array.isArray(nestedValue)) {
        errors.push(`${schemaFile} ${nestedPath}: unsupported local validator keyword "${key}" value; expected an object`);
        continue;
      }

      for (const [schemaName, nestedSchema] of Object.entries(nestedValue)) {
        errors.push(...findUnsupportedSchemaKeywords(schemaFile, nestedSchema, `${nestedPath}/${schemaName}`));
      }
      continue;
    }

    if (key === 'if' || key === 'then' || key === 'else' || key === 'items') {
      errors.push(...findUnsupportedSchemaKeywords(schemaFile, nestedValue, nestedPath));
    }
  }

  return errors;
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
    '`.memory.example/` contains safe fake JSONL fixtures',
    'cp -R .memory.example .memory',
    '`.memory/` itself should stay local-only and uncommitted',
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

test('.memory.example JSONL fixtures validate and demonstrate local-only usage', async () => {
  const recordsByFile = new Map<string, unknown[]>();

  for (const [fixturePath, schemaFile] of Object.entries(MEMORY_EXAMPLE_SCHEMA_BY_FILE)) {
    const absolutePath = resolve(memoryExampleDir, fixturePath);
    const content = await readFile(absolutePath, 'utf8');
    const records = parseJsonlLines(fixturePath, content);

    recordsByFile.set(fixturePath, records);
    assert.ok(records.length > 0, `${fixturePath} should include at least one safe demo record`);

    for (const [index, record] of records.entries()) {
      const result = await validateJson(record, resolve(schemasDir, schemaFile));
      assert.equal(result.valid, true, `${fixturePath}:${index + 1}: ${result.errors.join('; ')}`);
    }
  }

  const projectMemories = recordsByFile.get('project-memories.jsonl') as Array<Record<string, unknown>>;
  assert.ok(
    projectMemories.some((memory) => (
      typeof memory.gist === 'string'
      && /local-only/i.test(memory.gist)
      && /server/i.test(memory.gist)
      && /MCP/i.test(memory.gist)
    )),
    'project-memories.jsonl should include a local-only no-server/no-MCP project memory',
  );

  const pendingCandidates = recordsByFile.get('candidates/pending.jsonl') as Array<Record<string, unknown>>;
  assert.ok(
    pendingCandidates.some((candidate) => candidate.status === 'pending'),
    'candidates/pending.jsonl should include a pending candidate example',
  );
});

test('.memory.example fixtures contain only safe public demo data', async () => {
  for (const fixturePath of Object.keys(MEMORY_EXAMPLE_SCHEMA_BY_FILE)) {
    const absolutePath = resolve(memoryExampleDir, fixturePath);
    const content = await readFile(absolutePath, 'utf8');

    for (const { name, pattern } of SENSITIVE_EXAMPLE_PATTERNS) {
      assert.doesNotMatch(content, pattern, `${fixturePath} should not contain ${name}`);
    }

    for (const [index, record] of parseJsonlLines(fixturePath, content).entries()) {
      if (typeof record === 'object' && record !== null && 'sensitivity' in record) {
        assert.equal((record as Record<string, unknown>).sensitivity, 'public', `${fixturePath}:${index + 1} should use public sensitivity`);
      }
    }
  }
});

test('schema docs describe the local validator subset and schemas avoid unsupported keywords', async () => {
  const schemasReadme = await readFile(schemasReadmePath, 'utf8');

  assert.match(schemasReadme, /local, dependency-light subset/i);
  assert.match(schemasReadme, /must not assume unsupported draft 2020-12 keywords are enforced/i);

  for (const keyword of SUPPORTED_LOCAL_SCHEMA_KEYWORDS) {
    assert.ok(schemasReadme.includes(keyword), `schemas/README.md should document supported keyword ${keyword}`);
  }

  for (const keyword of UNSUPPORTED_LOCAL_SCHEMA_KEYWORDS) {
    assert.ok(schemasReadme.includes(keyword), `schemas/README.md should document unsupported keyword ${keyword}`);
  }

  for (const keyword of LOCAL_SCHEMA_METADATA_KEYWORDS) {
    assert.ok(schemasReadme.includes(keyword), `schemas/README.md should document metadata keyword ${keyword}`);
  }

  for (const schemaFile of EXPECTED_SCHEMAS) {
    const schema = await readJsonFile<Record<string, unknown>>(resolve(schemasDir, schemaFile));
    const unsupportedKeywordErrors = findUnsupportedSchemaKeywords(schemaFile, schema);

    assert.deepEqual(unsupportedKeywordErrors, [], unsupportedKeywordErrors.join('\n'));
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

  const approvalReviewResult = await validateJson(sampleApprovalReview, resolve(schemasDir, 'approval-review.schema.json'));
  assert.equal(approvalReviewResult.valid, true, approvalReviewResult.errors.join('; '));
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
