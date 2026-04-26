import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { approveMemoryCandidate } from './cli/memoryApprove.ts';
import { buildMemoryBriefing } from './cli/memoryBriefing.ts';
import { generateMemoryCandidates } from './cli/memoryCandidates.ts';
import { rejectMemoryCandidate } from './cli/memoryReject.ts';
import { searchMemory } from './cli/memorySearch.ts';
import { validateMemoryHarness } from './cli/memoryValidate.ts';
import { createMemoryConfig } from './config/memoryConfig.ts';
import { BRIEFING_MAX_ITEMS, BRIEFING_MAX_WORDS } from './contracts/constants.ts';
import type { MemoryCandidate, MemoryRecord, SessionEventRecord, TaskInput } from './contracts/types.ts';
import { validateBriefing } from './contracts/validateBriefing.ts';
import { validateCandidate } from './contracts/validateCandidate.ts';
import { validateMemory } from './contracts/validateMemory.ts';
import { attachConflicts } from './retrieval/detectConflicts.ts';
import { sampleCandidates } from './reference/sampleCandidates.ts';
import { sampleMemories, sampleSessionEvents, sampleTask } from './reference/sampleBriefing.ts';
import { readAuditEvents } from './store/auditStore.ts';
import { readCandidates } from './store/candidateStore.ts';
import { readJsonl, writeJsonl } from './store/jsonlStore.ts';
import { readAllMemories, readMemories } from './store/memoryStore.ts';
import { getRepoRoot, loadPrompt } from './loadPrompt.ts';
import { listPlaceholders, renderPrompt } from './renderPrompt.ts';
import { validateJson } from './validateJson.ts';
import { createMemoryOutputRetryInstruction, validateMemoryOutput } from './validateMemoryOutput.ts';

const repoRoot = getRepoRoot();

async function makeMemoryDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'memory-harness-'));
}

async function writeTask(path: string, task: TaskInput = sampleTask): Promise<void> {
  await writeFile(path, `${JSON.stringify(task, null, 2)}\n`, 'utf8');
}

function cloneMemory(memory: MemoryRecord, overrides?: Partial<MemoryRecord>): MemoryRecord {
  return {
    ...structuredClone(memory),
    ...overrides,
  };
}

function cloneCandidate(candidate: MemoryCandidate, overrides?: Partial<MemoryCandidate>): MemoryCandidate {
  return {
    ...structuredClone(candidate),
    ...overrides,
  };
}

test('loadPrompt prepends the base prompt automatically', async () => {
  const loadedPrompt = await loadPrompt('pre-task-briefing.md', repoRoot);

  assert.ok(loadedPrompt.combinedPrompt.startsWith(loadedPrompt.basePrompt.trimEnd()));
  assert.match(loadedPrompt.combinedPrompt, /# Local Memory Harness Base Prompt/);
  assert.match(loadedPrompt.combinedPrompt, /# Pre-task Memory Briefing/);
});

test('renderPrompt lists and replaces placeholders without guessing', () => {
  const template = 'Task: {{task}}\nMemories: {{memories}}';
  assert.deepEqual(listPlaceholders(template), ['task', 'memories']);

  const rendered = renderPrompt(template, {
    task: { task_id: 'task_1' },
    memories: [{ memory_id: 'mem_1' }],
  });

  assert.match(rendered, /"task_id": "task_1"/);
  assert.match(rendered, /"memory_id": "mem_1"/);
  assert.throws(() => renderPrompt('Task: {{task}}\nEvents: {{session_events}}', { task: {} }), /session_events/);
});

test('canonical schemas enforce score and briefing item limits', async () => {
  const candidateErrors = await validateCandidate({
    ...sampleCandidates[0],
    confidence: 1.2,
  });
  assert.ok(candidateErrors.some((error) => error.includes('<= 1')));

  const briefing = await buildMemoryBriefing({
    mode: 'demo',
    now: new Date('2026-04-26T00:00:00Z'),
  });
  const invalidBriefing = {
    ...briefing,
    items: Array.from({ length: BRIEFING_MAX_ITEMS + 1 }, () => briefing.items[0]),
  };
  const briefingErrors = await validateBriefing(invalidBriefing);
  assert.ok(briefingErrors.some((error) => error.includes(`at most ${BRIEFING_MAX_ITEMS}`)));
});

test('validateMemoryOutput accepts raw candidate JSON and rejects fenced JSON by default', async () => {
  const rawOutput = JSON.stringify(sampleCandidates[0]);
  const schemaPath = resolve(repoRoot, 'schemas/memory-candidate.schema.json');
  const valid = await validateMemoryOutput<MemoryCandidate>(rawOutput, schemaPath);
  assert.equal(valid.valid, true);

  const fenced = await validateMemoryOutput(`\`\`\`json\n${rawOutput}\n\`\`\``, schemaPath);
  assert.equal(fenced.valid, false);
  if (!fenced.valid) {
    assert.ok(fenced.errors.some((error) => error.includes('Markdown fenced JSON')));
  }

  const retry = createMemoryOutputRetryInstruction({
    schemaPath,
    errors: ['$.confidence: must be <= 1.'],
  });
  assert.match(retry, /Return raw JSON only/);
});

test('JSONL store reads missing files as empty and fails on broken local files', async () => {
  const memoryDir = await makeMemoryDir();
  const missing = await readJsonl(resolve(memoryDir, 'missing.jsonl'));
  assert.deepEqual(missing, []);

  const brokenPath = resolve(memoryDir, 'broken.jsonl');
  await writeFile(brokenPath, '{"ok": true}\n{"broken":\n', 'utf8');
  await assert.rejects(() => readJsonl(brokenPath), /Invalid JSONL/);
  await rm(memoryDir, { recursive: true, force: true });
});

test('strict mode requires explicit task input and never uses demo fallback', async () => {
  await assert.rejects(() => buildMemoryBriefing({ mode: 'strict' }), /Strict mode requires/);

  const memoryDir = await makeMemoryDir();
  const config = createMemoryConfig({ memoryDir });
  await writeFile(config.stores.memories.semantic, '{"broken":\n', 'utf8').catch(async () => {
    await writeJsonl(config.stores.memories.semantic, []);
    await writeFile(config.stores.memories.semantic, '{"broken":\n', 'utf8');
  });

  await assert.rejects(
    () => buildMemoryBriefing({ mode: 'strict', memoryDir, request: 'Use local memory.' }),
    /Invalid JSONL/,
  );
  await rm(memoryDir, { recursive: true, force: true });
});

test('demo mode is explicit and produces a valid bounded briefing', async () => {
  const briefing = await buildMemoryBriefing({
    mode: 'demo',
    now: new Date('2026-04-26T00:00:00Z'),
  });
  const errors = await validateBriefing(briefing);

  assert.deepEqual(errors, []);
  assert.equal(briefing.mode, 'demo');
  assert.equal(briefing.max_words, BRIEFING_MAX_WORDS);
  assert.equal(briefing.max_items, BRIEFING_MAX_ITEMS);
  assert.ok(briefing.items.length <= BRIEFING_MAX_ITEMS);
  assert.ok(briefing.rendered_briefing.split(/\s+/).length <= BRIEFING_MAX_WORDS);
});

test('strict briefing reads approved local JSONL memory only', async () => {
  const memoryDir = await makeMemoryDir();
  const taskPath = resolve(memoryDir, 'task.json');
  const config = createMemoryConfig({ memoryDir });
  await writeTask(taskPath);
  await writeJsonl(config.stores.memories.semantic, [sampleMemories[0]]);

  const briefing = await buildMemoryBriefing({
    memoryDir,
    taskPath,
    now: new Date('2026-04-26T00:00:00Z'),
  });

  assert.equal(briefing.mode, 'strict');
  assert.equal(briefing.items[0].memory_id, sampleMemories[0].memory_id);
  assert.match(briefing.rendered_briefing, /local-only/);
  await rm(memoryDir, { recursive: true, force: true });
});

test('candidate generation writes pending candidates and audit events but no permanent memory', async () => {
  const memoryDir = await makeMemoryDir();
  const config = createMemoryConfig({ memoryDir });
  await writeJsonl(config.stores.sessions.latest, sampleSessionEvents);

  const candidates = await generateMemoryCandidates({
    memoryDir,
    now: new Date('2026-04-26T00:10:00Z'),
  });
  const pending = await readCandidates(config, 'pending');
  const approvedMemories = await readAllMemories(config);
  const audit = await readAuditEvents(config);

  assert.ok(candidates.length >= 1);
  assert.equal(pending.length, candidates.length);
  assert.equal(approvedMemories.length, 0);
  assert.ok(audit.every((event) => event.action === 'candidate_generated'));
  await rm(memoryDir, { recursive: true, force: true });
});

test('demo candidate generation does not write to local pending queue', async () => {
  const memoryDir = await makeMemoryDir();
  const config = createMemoryConfig({ memoryDir });
  const candidates = await generateMemoryCandidates({
    mode: 'demo',
    memoryDir,
  });
  const pending = await readCandidates(config, 'pending');

  assert.deepEqual(candidates, sampleCandidates);
  assert.deepEqual(pending, []);
  await rm(memoryDir, { recursive: true, force: true });
});

test('approval flow moves a pending candidate into approved memory', async () => {
  const memoryDir = await makeMemoryDir();
  const config = createMemoryConfig({ memoryDir });
  await writeJsonl(config.stores.candidates.pending, [sampleCandidates[0]]);

  const result = await approveMemoryCandidate({
    memoryDir,
    candidateId: sampleCandidates[0].candidate_id,
    reason: 'User approved this repository boundary.',
    now: new Date('2026-04-26T00:15:00Z'),
  });
  const pending = await readCandidates(config, 'pending');
  const approved = await readCandidates(config, 'approved');
  const memories = await readMemories(config, 'semantic');
  const audit = await readAuditEvents(config);

  assert.equal(result.memory.memory_id, 'mem_demo_local_only');
  assert.deepEqual(pending, []);
  assert.equal(approved.length, 1);
  assert.equal(memories.length, 1);
  assert.equal(memories[0].status, 'active');
  assert.ok(audit.some((event) => event.action === 'candidate_approved'));
  await rm(memoryDir, { recursive: true, force: true });
});

test('rejection flow moves a pending candidate without writing permanent memory', async () => {
  const memoryDir = await makeMemoryDir();
  const config = createMemoryConfig({ memoryDir });
  await writeJsonl(config.stores.candidates.pending, [sampleCandidates[0]]);

  await rejectMemoryCandidate({
    memoryDir,
    candidateId: sampleCandidates[0].candidate_id,
    reason: 'Too broad for durable memory.',
    now: new Date('2026-04-26T00:20:00Z'),
  });

  assert.deepEqual(await readCandidates(config, 'pending'), []);
  assert.equal((await readCandidates(config, 'rejected')).length, 1);
  assert.equal((await readAllMemories(config)).length, 0);
  assert.ok((await readAuditEvents(config)).some((event) => event.action === 'candidate_rejected'));
  await rm(memoryDir, { recursive: true, force: true });
});

test('conflict detection and supersedes are preserved during approval', async () => {
  const memoryDir = await makeMemoryDir();
  const config = createMemoryConfig({ memoryDir });
  const oldMemory = cloneMemory(sampleMemories[0], {
    memory_id: 'mem_old_transport',
    gist: 'This repository may add an MCP server for memory retrieval.',
  });
  const candidate = attachConflicts(
    cloneCandidate(sampleCandidates[0], {
      candidate_id: 'cand_replace_transport',
      supersedes: ['mem_old_transport'],
    }),
    [oldMemory],
  );
  await writeJsonl(config.stores.memories.semantic, [oldMemory]);
  await writeJsonl(config.stores.candidates.pending, [candidate]);

  const candidateErrors = await validateCandidate(candidate);
  assert.deepEqual(candidateErrors, []);
  assert.ok(candidate.conflicts.some((conflict) => conflict.conflict_type === 'supersedes'));

  await approveMemoryCandidate({
    memoryDir,
    candidateId: candidate.candidate_id,
    reason: 'User approved the local-only replacement.',
    now: new Date('2026-04-26T00:25:00Z'),
  });
  const memories = await readMemories(config, 'semantic');
  const superseded = memories.find((memory) => memory.memory_id === 'mem_old_transport');
  const replacement = memories.find((memory) => memory.memory_id === 'mem_replace_transport');

  assert.equal(superseded?.status, 'superseded');
  assert.equal(superseded?.superseded_by, 'mem_replace_transport');
  assert.equal(replacement?.status, 'active');
  assert.ok((await readAuditEvents(config)).some((event) => event.action === 'memory_superseded'));
  await rm(memoryDir, { recursive: true, force: true });
});

test('search returns approved local memories ranked by query match', async () => {
  const memoryDir = await makeMemoryDir();
  const config = createMemoryConfig({ memoryDir });
  await writeJsonl(config.stores.memories.semantic, sampleMemories);

  const results = await searchMemory({
    memoryDir,
    query: 'local OpenAI API server',
  });

  assert.ok(results.length >= 1);
  assert.equal(results[0].memory_id, 'mem_demo_local_only');
  assert.ok(results[0].match_score > 0);
  await rm(memoryDir, { recursive: true, force: true });
});

test('memory validation catches broken local stores', async () => {
  const memoryDir = await makeMemoryDir();
  const config = createMemoryConfig({ memoryDir });
  await writeFile(config.stores.memories.semantic, '{"broken":\n', 'utf8').catch(async () => {
    await writeJsonl(config.stores.memories.semantic, []);
    await writeFile(config.stores.memories.semantic, '{"broken":\n', 'utf8');
  });
  const result = await validateMemoryHarness({ memoryDir });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('Invalid JSONL')));
  await rm(memoryDir, { recursive: true, force: true });
});

test('reference memory records validate against the canonical memory schema', async () => {
  for (const memory of sampleMemories) {
    assert.deepEqual(await validateMemory(memory), []);
  }
});
