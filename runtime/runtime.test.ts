import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { approveMemoryCandidate, parseMemoryApproveArgs } from './cli/memoryApprove.ts';
import { buildMemoryBriefing, parseMemoryBriefingArgs, resolveBriefingTask } from './cli/memoryBriefing.ts';
import { generateMemoryCandidates, generateMemoryCandidatesWithReport, parseMemoryCandidatesArgs } from './cli/memoryCandidates.ts';
import { rejectMemoryCandidate, parseMemoryRejectArgs } from './cli/memoryReject.ts';
import { parseMemorySearchArgs, searchMemory } from './cli/memorySearch.ts';
import { parseMemoryValidateArgs, validateMemoryHarness } from './cli/memoryValidate.ts';
import { createMemoryConfig } from './config/memoryConfig.ts';
import { BRIEFING_MAX_ITEMS, BRIEFING_MAX_WORDS } from './contracts/constants.ts';
import type { ApprovalEvent, MemoryCandidate, MemoryRecord, SessionEventRecord, TaskInput } from './contracts/types.ts';
import { validateBriefing } from './contracts/validateBriefing.ts';
import { validateCandidate, validateCandidateSemantics } from './contracts/validateCandidate.ts';
import { validateMemory, validateMemorySemantics } from './contracts/validateMemory.ts';
import { attachConflicts } from './retrieval/detectConflicts.ts';
import { rankMemories } from './retrieval/rankMemories.ts';
import { lexicalOverlapScore, memoryLexicalScore, tokenizeText } from './retrieval/lexicalScore.ts';
import { sampleCandidates } from './reference/sampleCandidates.ts';
import { sampleMemories, sampleSessionEvents, sampleTask } from './reference/sampleBriefing.ts';
import { appendAuditEvent, readAuditEvents } from './store/auditStore.ts';
import { readCandidates } from './store/candidateStore.ts';
import { readJsonl, writeJsonl } from './store/jsonlStore.ts';
import { readAllMemories, readMemories } from './store/memoryStore.ts';
import { getRepoRoot, loadPrompt } from './loadPrompt.ts';
import { listPlaceholders, renderPrompt } from './renderPrompt.ts';
import { validateJson } from './validateJson.ts';
import { createMemoryOutputRetryInstruction, validateMemoryOutput } from './validateMemoryOutput.ts';

const repoRoot = getRepoRoot();

function runRuntimeCli(scriptPath: string, args: string[]) {
  return spawnSync(process.execPath, ['--experimental-strip-types', resolve(repoRoot, scriptPath), ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

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

function auditEvent(eventId: string, overrides?: Partial<ApprovalEvent>): ApprovalEvent {
  return {
    event_id: eventId,
    action: 'candidate_generated',
    candidate_id: sampleCandidates[0].candidate_id,
    memory_id: null,
    decided_at: '2026-04-26T00:00:00.000Z',
    decided_by: 'runtime',
    reason: 'Test audit event.',
    evidence_refs: sampleCandidates[0].evidence_refs,
    ...overrides,
  };
}

function conflictTypesForGists(memoryGist: string, candidateGist: string): string[] {
  const memory = cloneMemory(sampleMemories[0], {
    memory_id: 'mem_conflict_fixture',
    gist: memoryGist,
    scope_type: 'repo',
    scope_value: 'custom/repo',
    conflicts: [],
  });
  const candidate = attachConflicts(
    cloneCandidate(sampleCandidates[0], {
      candidate_id: 'cand_conflict_fixture',
      gist: candidateGist,
      scope_type: 'repo',
      scope_value: 'custom/repo',
      supersedes: [],
      conflicts: [],
    }),
    [memory],
  );

  return candidate.conflicts.map((conflict) => conflict.conflict_type);
}

async function withEnv<T>(values: Record<string, string | undefined>, run: () => T | Promise<T>): Promise<T> {
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);

    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await run();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function withRepoScopeEnv<T>(value: string | undefined, run: () => T | Promise<T>): Promise<T> {
  return withEnv({ MEMORY_REPO_SCOPE: value }, run);
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

test('memory config resolves repo scope from option, environment, then local fallback', async () => {
  await withRepoScopeEnv('env/repo-scope', () => {
    assert.equal(createMemoryConfig({ repoScope: 'explicit/repo-scope' }).repoScope, 'explicit/repo-scope');
    assert.equal(createMemoryConfig().repoScope, 'env/repo-scope');
  });

  await withRepoScopeEnv(undefined, () => {
    assert.equal(createMemoryConfig().repoScope, 'local');
  });
});

test('memory config separates harness root from project memory root', async () => {
  const projectRoot = await makeMemoryDir();

  await withEnv(
    {
      MEMORY_HARNESS_ROOT: repoRoot,
      MEMORY_PROJECT_ROOT: projectRoot,
    },
    () => {
      const envConfig = createMemoryConfig();
      assert.equal(envConfig.harnessRoot, repoRoot);
      assert.equal(envConfig.repoRoot, repoRoot);
      assert.equal(envConfig.projectRoot, projectRoot);
      assert.equal(envConfig.memoryDir, resolve(projectRoot, '.memory'));
      assert.equal(envConfig.stores.memories.semantic, resolve(projectRoot, '.memory/semantic-memories.jsonl'));

      const explicitConfig = createMemoryConfig({
        harnessRoot: repoRoot,
        projectRoot,
        memoryDir: 'custom-memory',
      });
      assert.equal(explicitConfig.memoryDir, resolve(projectRoot, 'custom-memory'));
      assert.equal(explicitConfig.stores.audit, resolve(projectRoot, 'custom-memory/audit/memory-events.jsonl'));
    },
  );

  await rm(projectRoot, { recursive: true, force: true });
});

test('memory CLI parsers reject missing values and unknown flags', () => {
  assert.throws(
    () => parseMemoryBriefingArgs(['--request']),
    /--request requires a non-empty value/,
  );
  assert.throws(
    () => parseMemoryBriefingArgs(['--unknown']),
    /Unknown option: --unknown/,
  );
  assert.throws(
    () => parseMemoryApproveArgs(['--candidate', 'cand_demo']),
    /memory:approve requires --reason <reason>/,
  );
  assert.throws(
    () => parseMemoryRejectArgs(['--candidate', 'cand_demo', '--reason', '']),
    /--reason requires a non-empty value/,
  );
});

test('memory CLI parsers accept existing valid command shapes', () => {
  assert.deepEqual(parseMemoryBriefingArgs([
    '--demo',
    '--request',
    'Refactor briefing.',
    '--repo',
    'custom/repo',
    '--scope-type',
    'repo',
    '--scope-value',
    'custom/repo',
  ]), {
    demo: true,
    taskPath: undefined,
    request: 'Refactor briefing.',
    memoryDir: undefined,
    projectRoot: undefined,
    harnessRoot: undefined,
    repo: 'custom/repo',
    branch: undefined,
    scopeType: 'repo',
    scopeValue: 'custom/repo',
  });
  assert.deepEqual(parseMemoryCandidatesArgs([
    '--dry-run',
    '--replace-pending',
    '--report',
    '--repo',
    'custom/repo',
  ]), {
    demo: false,
    dryRun: true,
    replacePending: true,
    report: true,
    sessionPath: undefined,
    memoryDir: undefined,
    projectRoot: undefined,
    harnessRoot: undefined,
    repoScope: 'custom/repo',
  });
  assert.deepEqual(parseMemorySearchArgs(['schema validation']), {
    demo: false,
    query: 'schema validation',
    memoryDir: undefined,
    projectRoot: undefined,
    harnessRoot: undefined,
    repoScope: undefined,
  });
  assert.equal(parseMemoryApproveArgs(['--candidate', 'cand_demo', '--reason', 'User approved.']).reason, 'User approved.');
  assert.equal(parseMemoryValidateArgs(['--repo-scope', 'custom/repo']).repoScope, 'custom/repo');
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

test('briefing can use harness schemas with project-root memory and task files', async () => {
  const projectRoot = await makeMemoryDir();
  const config = createMemoryConfig({ harnessRoot: repoRoot, projectRoot });
  const task: TaskInput = {
    ...sampleTask,
    task_id: 'task_project_root',
    user_request: 'Use approved local-only memory from the host project.',
    repo: 'custom/repo',
    scope_type: 'repo',
    scope_value: 'custom/repo',
  };
  await writeTask(resolve(projectRoot, 'task.json'), task);
  await writeJsonl(config.stores.memories.semantic, [
    cloneMemory(sampleMemories[0], {
      scope_value: 'custom/repo',
    }),
  ]);

  const briefing = await buildMemoryBriefing({
    harnessRoot: repoRoot,
    projectRoot,
    taskPath: 'task.json',
    now: new Date('2026-04-26T00:00:00Z'),
  });

  assert.equal(config.stores.memories.semantic, resolve(projectRoot, '.memory/semantic-memories.jsonl'));
  assert.equal(briefing.items[0].memory_id, sampleMemories[0].memory_id);
  assert.deepEqual(await validateBriefing(briefing, repoRoot), []);
  await rm(projectRoot, { recursive: true, force: true });
});

test('request briefing accepts explicit repo scope and ranks repo memory strongly', async () => {
  const memoryDir = await makeMemoryDir();
  const config = createMemoryConfig({ memoryDir });
  await writeJsonl(config.stores.memories.semantic, [sampleMemories[0]]);

  const task = await resolveBriefingTask(
    {
      request: 'Keep the memory harness local-only and avoid server work.',
      repo: 'rktkdduq01/Long-term-memory',
    },
    'strict',
  );
  assert.equal(task.repo, 'rktkdduq01/Long-term-memory');
  assert.equal(task.scope_type, 'repo');
  assert.equal(task.scope_value, 'rktkdduq01/Long-term-memory');

  const briefing = await buildMemoryBriefing({
    memoryDir,
    request: 'Keep the memory harness local-only and avoid server work.',
    repo: 'rktkdduq01/Long-term-memory',
    now: new Date('2026-04-26T00:00:00Z'),
  });

  assert.equal(briefing.items[0].memory_id, sampleMemories[0].memory_id);
  assert.ok(briefing.items[0].relevance > 0.9);
  await rm(memoryDir, { recursive: true, force: true });
});

test('request briefing without repo falls back to local scope and still works', async () => {
  const memoryDir = await makeMemoryDir();

  await withRepoScopeEnv('rktkdduq01/Long-term-memory', async () => {
    const configuredTask = await resolveBriefingTask(
      {
        request: 'Summarize configured repository memory before this task.',
      },
      'strict',
      createMemoryConfig({ memoryDir }).repoScope,
    );
    assert.equal(configuredTask.repo, 'rktkdduq01/Long-term-memory');
    assert.equal(configuredTask.scope_value, 'rktkdduq01/Long-term-memory');
  });

  await withRepoScopeEnv(undefined, async () => {
    const task = await resolveBriefingTask(
      {
        request: 'Summarize local memory before this task.',
      },
      'strict',
      createMemoryConfig({ memoryDir }).repoScope,
    );
    assert.equal(task.repo, 'local');
    assert.equal(task.scope_type, 'repo');
    assert.equal(task.scope_value, 'local');

    const briefing = await buildMemoryBriefing({
      memoryDir,
      request: 'Summarize local memory before this task.',
      now: new Date('2026-04-26T00:00:00Z'),
    });

    assert.equal(briefing.mode, 'strict');
    assert.deepEqual(briefing.items, []);
  });
  await rm(memoryDir, { recursive: true, force: true });
});

test('task file briefing keeps task scope fields despite CLI scope options', async () => {
  const memoryDir = await makeMemoryDir();
  const taskPath = resolve(memoryDir, 'task.json');
  const taskFileInput: TaskInput = {
    ...sampleTask,
    task_id: 'task_file_scope_stays_authoritative',
    repo: 'example/task-file-repo',
    branch: 'task-file-branch',
    scope_type: 'directory',
    scope_value: 'runtime/task-file',
    metadata: {
      task_type: 'task_file_mode',
    },
  };
  await writeTask(taskPath, taskFileInput);

  const task = await resolveBriefingTask(
    {
      taskPath,
      repo: 'rktkdduq01/Long-term-memory',
      branch: 'cli-branch',
      scopeType: 'repo',
      scopeValue: 'rktkdduq01/Long-term-memory',
    },
    'strict',
    'configured/repo',
  );

  assert.equal(task.repo, 'example/task-file-repo');
  assert.equal(task.branch, 'task-file-branch');
  assert.equal(task.scope_type, 'directory');
  assert.equal(task.scope_value, 'runtime/task-file');
  await rm(memoryDir, { recursive: true, force: true });
});

test('briefing ranking uses lexical relevance with task and memory content', () => {
  const task: TaskInput = {
    task_id: 'task_lexical_ranking',
    user_request: 'approval rejection CLI reason audit logs',
    repo: 'custom/repo',
    scope_type: 'repo',
    scope_value: 'custom/repo',
    metadata: {
      task_type: 'approval_reason',
    },
  };
  const relevant = cloneMemory(sampleMemories[0], {
    memory_id: 'mem_approval_reason_relevant',
    gist: 'Approval and rejection CLI commands require a non-empty reason for audit logs.',
    scope_value: 'custom/repo',
    confidence: 0.75,
    importance: 0.75,
    evidence_refs: [
      {
        ...sampleMemories[0].evidence_refs[0],
        quote_or_summary: 'Approval reason audit logs require explicit reasons.',
      },
    ],
  });
  const unrelated = cloneMemory(sampleMemories[0], {
    memory_id: 'mem_high_confidence_unrelated',
    gist: 'The project keeps local JSONL storage and prompt schemas deterministic.',
    scope_value: 'custom/repo',
    confidence: 0.99,
    importance: 0.99,
    evidence_refs: [
      {
        ...sampleMemories[0].evidence_refs[0],
        quote_or_summary: 'Local JSONL storage remains deterministic.',
      },
    ],
  });

  const ranked = rankMemories(task, [unrelated, relevant]);

  assert.equal(ranked[0].memory.memory_id, relevant.memory_id);
  assert.ok(memoryLexicalScore(task, relevant) > memoryLexicalScore(task, unrelated));
});

test('lexical scoring is Unicode-aware for English and Korean text', () => {
  assert.deepEqual(tokenizeText('Server, MCP 서버화!'), ['server', 'mcp', '서버화']);
  assert.ok(lexicalOverlapScore('approval reason audit', 'Approval audit events require a reason.') > 0);
  assert.ok(lexicalOverlapScore('서버 사용', '서버를 사용하지 않는다') > 0);
});

test('search and briefing ranking share memory lexical scoring', async () => {
  const memoryDir = await makeMemoryDir();
  const config = createMemoryConfig({ memoryDir });
  const koreanMemory = cloneMemory(sampleMemories[0], {
    memory_id: 'mem_korean_lexical',
    kind: 'project',
    memory_type: 'project_constraint',
    gist: '이 프로젝트는 서버를 사용하지 않는 로컬 메모리 하네스이다.',
    scope_value: 'custom/repo',
    evidence_refs: [
      {
        ...sampleMemories[0].evidence_refs[0],
        quote_or_summary: '서버를 사용하지 않는 로컬 메모리 하네스 방향이 확인되었다.',
      },
    ],
  });
  const query = '서버 사용 로컬 메모리';
  const task: TaskInput = {
    task_id: 'task_korean_lexical',
    user_request: query,
    repo: 'custom/repo',
    scope_type: 'repo',
    scope_value: 'custom/repo',
    metadata: {},
  };
  await writeJsonl(config.stores.memories.project, [koreanMemory]);

  const searchResults = await searchMemory({
    memoryDir,
    query,
  });
  const ranked = rankMemories(task, [koreanMemory]);
  const expectedScore = memoryLexicalScore(query, koreanMemory);

  assert.equal(searchResults[0].memory_id, koreanMemory.memory_id);
  assert.equal(searchResults[0].match_score, expectedScore);
  assert.equal(ranked[0].memory.memory_id, koreanMemory.memory_id);
  assert.ok(memoryLexicalScore(task, koreanMemory) >= expectedScore);
  await rm(memoryDir, { recursive: true, force: true });
});

test('briefing warnings surface selected conflicts and uncertainty', async () => {
  const conflictMemoryDir = await makeMemoryDir();
  const conflictConfig = createMemoryConfig({ memoryDir: conflictMemoryDir });
  const conflictMemory = cloneMemory(sampleMemories[0], {
    memory_id: 'mem_conflict_warning',
    scope_value: 'custom/repo',
    gist: 'Conflict warning memory for approval reason audit logs.',
    conflicts: [
      {
        memory_id: 'mem_related_conflict',
        conflict_type: 'direct_conflict',
        note: 'Conflicts with a related approved memory.',
        confidence: 0.88,
      },
    ],
  });
  await writeJsonl(conflictConfig.stores.memories.semantic, [conflictMemory]);

  const conflictBriefing = await buildMemoryBriefing({
    memoryDir: conflictMemoryDir,
    request: 'approval reason audit conflict warning memory',
    repo: 'custom/repo',
    now: new Date('2026-04-26T00:00:00Z'),
  });
  assert.ok(conflictBriefing.items.some((item) => item.category === 'conflict'));
  assert.ok(
    conflictBriefing.warnings.some(
      (warning) => warning.includes('Selected memories include unresolved conflicts') &&
        warning.includes('mem_conflict_warning') &&
        warning.includes('mem_related_conflict'),
    ),
  );
  assert.deepEqual(await validateBriefing(conflictBriefing), []);
  await rm(conflictMemoryDir, { recursive: true, force: true });

  const uncertaintyMemoryDir = await makeMemoryDir();
  const uncertaintyConfig = createMemoryConfig({ memoryDir: uncertaintyMemoryDir });
  const uncertaintyMemory = cloneMemory(sampleMemories[0], {
    memory_id: 'mem_uncertainty_warning',
    memory_type: 'failure_lesson',
    scope_value: 'custom/repo',
    gist: 'Uncertain warning memory for approval reason audit logs.',
    confidence: 0.45,
    importance: 0.45,
    conflicts: [],
  });
  await writeJsonl(uncertaintyConfig.stores.memories.semantic, [uncertaintyMemory]);

  const uncertaintyBriefing = await buildMemoryBriefing({
    memoryDir: uncertaintyMemoryDir,
    request: 'approval reason audit uncertainty warning memory',
    repo: 'custom/repo',
    now: new Date('2026-04-26T00:00:00Z'),
  });
  assert.ok(uncertaintyBriefing.items.some((item) => item.category === 'uncertainty'));
  assert.ok(
    uncertaintyBriefing.warnings.some(
      (warning) => warning.includes('Selected memories include uncertain or low-confidence items') &&
        warning.includes('mem_uncertainty_warning'),
    ),
  );
  assert.deepEqual(await validateBriefing(uncertaintyBriefing), []);
  await rm(uncertaintyMemoryDir, { recursive: true, force: true });
});

test('normal briefing without conflict or uncertainty has clean warnings', async () => {
  const memoryDir = await makeMemoryDir();
  const config = createMemoryConfig({ memoryDir });
  await writeJsonl(config.stores.memories.semantic, [
    cloneMemory(sampleMemories[0], {
      memory_id: 'mem_clean_briefing',
      scope_value: 'custom/repo',
      gist: 'Clean briefing memory for approval reason audit logs.',
      conflicts: [],
      confidence: 0.95,
      importance: 0.95,
    }),
  ]);

  const briefing = await buildMemoryBriefing({
    memoryDir,
    request: 'approval reason audit clean briefing memory',
    repo: 'custom/repo',
    now: new Date('2026-04-26T00:00:00Z'),
  });

  assert.ok(briefing.items.length > 0);
  assert.deepEqual(briefing.warnings, []);
  assert.deepEqual(await validateBriefing(briefing), []);
  await rm(memoryDir, { recursive: true, force: true });
});

test('audit events append JSONL lines and read back', async () => {
  const memoryDir = await makeMemoryDir();
  const config = createMemoryConfig({ memoryDir });
  const first = auditEvent('audit_append_one');
  const second = auditEvent('audit_append_two', {
    candidate_id: 'cand_append_two',
    decided_at: '2026-04-26T00:01:00.000Z',
  });

  await appendAuditEvent(config, first);
  const firstRaw = await readFile(config.stores.audit, 'utf8');
  assert.equal(firstRaw.endsWith('\n'), true);
  assert.equal(firstRaw.trimEnd().split('\n').length, 1);

  await appendAuditEvent(config, second);
  const raw = await readFile(config.stores.audit, 'utf8');
  const lines = raw.trimEnd().split('\n');
  const events = await readAuditEvents(config);

  assert.equal(lines.length, 2);
  assert.equal((JSON.parse(lines[0]) as ApprovalEvent).event_id, first.event_id);
  assert.equal((JSON.parse(lines[1]) as ApprovalEvent).event_id, second.event_id);
  assert.deepEqual(events.map((event) => event.event_id), [first.event_id, second.event_id]);
  await rm(memoryDir, { recursive: true, force: true });
});

test('candidate generation writes pending candidates and audit events but no permanent memory', async () => {
  const memoryDir = await makeMemoryDir();
  const config = createMemoryConfig({ memoryDir, repoScope: 'custom/repo' });
  await writeJsonl(config.stores.sessions.latest, sampleSessionEvents);

  const candidates = await generateMemoryCandidates({
    memoryDir,
    repoScope: 'custom/repo',
    now: new Date('2026-04-26T00:10:00Z'),
  });
  const pending = await readCandidates(config, 'pending');
  const approvedMemories = await readAllMemories(config);
  const audit = await readAuditEvents(config);

  assert.ok(candidates.length >= 1);
  assert.equal(pending.length, candidates.length);
  assert.equal(approvedMemories.length, 0);
  assert.equal(candidates.find((candidate) => candidate.scope_type === 'repo')?.scope_value, 'custom/repo');
  assert.ok(audit.every((event) => event.action === 'candidate_generated'));
  await rm(memoryDir, { recursive: true, force: true });
});

test('candidate generation skips duplicate pending candidates and audit events', async () => {
  const memoryDir = await makeMemoryDir();
  const config = createMemoryConfig({ memoryDir, repoScope: 'custom/repo' });
  await writeJsonl(config.stores.sessions.latest, sampleSessionEvents);

  const first = await generateMemoryCandidatesWithReport({
    memoryDir,
    repoScope: 'custom/repo',
    now: new Date('2026-04-26T00:10:00Z'),
  });
  const second = await generateMemoryCandidatesWithReport({
    memoryDir,
    repoScope: 'custom/repo',
    now: new Date('2026-04-26T00:11:00Z'),
  });
  const pending = await readCandidates(config, 'pending');
  const generatedAuditEvents = (await readAuditEvents(config)).filter((event) => event.action === 'candidate_generated');

  assert.ok(first.appended.length >= 1);
  assert.equal(second.appended.length, 0);
  assert.equal(second.replaced.length, 0);
  assert.equal(second.skipped.length, first.appended.length);
  assert.ok(second.skipped.every((entry) => entry.existing_status === 'pending'));
  assert.equal(pending.length, first.appended.length);
  assert.equal(generatedAuditEvents.length, first.appended.length);
  await rm(memoryDir, { recursive: true, force: true });
});

test('candidate generation does not re-add approved or rejected candidates to pending', async () => {
  const memoryDir = await makeMemoryDir();
  const config = createMemoryConfig({ memoryDir, repoScope: 'custom/repo' });
  await writeJsonl(config.stores.sessions.latest, sampleSessionEvents);
  await writeJsonl(config.stores.candidates.approved, [
    cloneCandidate(sampleCandidates[0], {
      candidate_id: 'cand_demo_user_direction',
      status: 'approved',
    }),
  ]);
  await writeJsonl(config.stores.candidates.rejected, [
    cloneCandidate(sampleCandidates[0], {
      candidate_id: 'cand_demo_validation',
      status: 'rejected',
    }),
  ]);

  const report = await generateMemoryCandidatesWithReport({
    memoryDir,
    repoScope: 'custom/repo',
    now: new Date('2026-04-26T00:10:00Z'),
  });

  assert.equal(report.appended.length, 0);
  assert.equal(report.replaced.length, 0);
  assert.equal(report.skipped.length, 2);
  assert.deepEqual(new Set(report.skipped.map((entry) => entry.existing_status)), new Set(['approved', 'rejected']));
  assert.deepEqual(await readCandidates(config, 'pending'), []);
  assert.deepEqual(await readAuditEvents(config), []);
  await rm(memoryDir, { recursive: true, force: true });
});

test('replace pending updates only pending duplicates without duplicate audit events', async () => {
  const memoryDir = await makeMemoryDir();
  const config = createMemoryConfig({ memoryDir, repoScope: 'custom/repo' });
  await writeJsonl(config.stores.sessions.latest, [sampleSessionEvents[0]]);

  const first = await generateMemoryCandidatesWithReport({
    memoryDir,
    repoScope: 'custom/repo',
    now: new Date('2026-04-26T00:10:00Z'),
  });
  await writeJsonl(config.stores.sessions.latest, [
    {
      ...sampleSessionEvents[0],
      summary: 'Updated pending candidate summary.',
    },
  ]);
  const second = await generateMemoryCandidatesWithReport({
    memoryDir,
    repoScope: 'custom/repo',
    replacePending: true,
    now: new Date('2026-04-26T00:12:00Z'),
  });
  const pending = await readCandidates(config, 'pending');
  const generatedAuditEvents = (await readAuditEvents(config)).filter((event) => event.action === 'candidate_generated');

  assert.equal(first.appended.length, 1);
  assert.equal(second.appended.length, 0);
  assert.equal(second.replaced.length, 1);
  assert.equal(second.skipped.length, 0);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].gist, 'Updated pending candidate summary.');
  assert.equal(generatedAuditEvents.length, 1);
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
  const reason = 'User approved this repository boundary.';
  await writeJsonl(config.stores.candidates.pending, [sampleCandidates[0]]);

  const result = await approveMemoryCandidate({
    memoryDir,
    candidateId: sampleCandidates[0].candidate_id,
    reason,
    now: new Date('2026-04-26T00:15:00Z'),
  });
  const pending = await readCandidates(config, 'pending');
  const approved = await readCandidates(config, 'approved');
  const memories = await readMemories(config, 'semantic');
  const audit = await readAuditEvents(config);
  const approvalEvent = audit.find((event) => event.action === 'candidate_approved');

  assert.equal(result.memory.memory_id, 'mem_demo_local_only');
  assert.deepEqual(pending, []);
  assert.equal(approved.length, 1);
  assert.equal(memories.length, 1);
  assert.equal(memories[0].status, 'active');
  assert.equal(result.approvalEvent.reason, reason);
  assert.equal(approvalEvent?.reason, reason);
  await rm(memoryDir, { recursive: true, force: true });
});

test('approval requires a non-empty reason in programmatic and CLI flows', async () => {
  const memoryDir = await makeMemoryDir();
  const config = createMemoryConfig({ memoryDir });
  await writeJsonl(config.stores.candidates.pending, [sampleCandidates[0]]);

  await assert.rejects(
    () => approveMemoryCandidate({
      memoryDir,
      candidateId: sampleCandidates[0].candidate_id,
    } as Parameters<typeof approveMemoryCandidate>[0]),
    /non-empty reason is required to approve/,
  );
  await assert.rejects(
    () => approveMemoryCandidate({
      memoryDir,
      candidateId: sampleCandidates[0].candidate_id,
      reason: '   ',
    }),
    /non-empty reason is required to approve/,
  );

  const result = runRuntimeCli('runtime/cli/memoryApprove.ts', [
    '--memory-dir',
    memoryDir,
    '--candidate',
    sampleCandidates[0].candidate_id,
  ]);

  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}${result.stdout}`, /memory:approve requires --reason <reason>/);
  assert.equal((await readCandidates(config, 'pending')).length, 1);
  assert.deepEqual(await readAuditEvents(config), []);

  const reason = 'CLI approved this candidate.';
  const success = runRuntimeCli('runtime/cli/memoryApprove.ts', [
    '--memory-dir',
    memoryDir,
    '--candidate',
    sampleCandidates[0].candidate_id,
    '--reason',
    reason,
  ]);
  const approvalEvent = (await readAuditEvents(config)).find((event) => event.action === 'candidate_approved');

  assert.equal(success.status, 0, success.stderr);
  assert.equal(approvalEvent?.reason, reason);
  await rm(memoryDir, { recursive: true, force: true });
});

test('rejection flow moves a pending candidate without writing permanent memory', async () => {
  const memoryDir = await makeMemoryDir();
  const config = createMemoryConfig({ memoryDir });
  const reason = 'Too broad for durable memory.';
  await writeJsonl(config.stores.candidates.pending, [sampleCandidates[0]]);

  const result = await rejectMemoryCandidate({
    memoryDir,
    candidateId: sampleCandidates[0].candidate_id,
    reason,
    now: new Date('2026-04-26T00:20:00Z'),
  });
  const rejectionEvent = (await readAuditEvents(config)).find((event) => event.action === 'candidate_rejected');

  assert.deepEqual(await readCandidates(config, 'pending'), []);
  assert.equal((await readCandidates(config, 'rejected')).length, 1);
  assert.equal((await readAllMemories(config)).length, 0);
  assert.equal(result.rejectionEvent.reason, reason);
  assert.equal(rejectionEvent?.reason, reason);
  await rm(memoryDir, { recursive: true, force: true });
});

test('rejection requires a non-empty reason in programmatic and CLI flows', async () => {
  const memoryDir = await makeMemoryDir();
  const config = createMemoryConfig({ memoryDir });
  await writeJsonl(config.stores.candidates.pending, [sampleCandidates[0]]);

  await assert.rejects(
    () => rejectMemoryCandidate({
      memoryDir,
      candidateId: sampleCandidates[0].candidate_id,
    } as Parameters<typeof rejectMemoryCandidate>[0]),
    /non-empty reason is required to reject/,
  );
  await assert.rejects(
    () => rejectMemoryCandidate({
      memoryDir,
      candidateId: sampleCandidates[0].candidate_id,
      reason: '   ',
    }),
    /non-empty reason is required to reject/,
  );

  const result = runRuntimeCli('runtime/cli/memoryReject.ts', [
    '--memory-dir',
    memoryDir,
    '--candidate',
    sampleCandidates[0].candidate_id,
  ]);

  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}${result.stdout}`, /memory:reject requires --reason <reason>/);
  assert.equal((await readCandidates(config, 'pending')).length, 1);
  assert.deepEqual(await readAuditEvents(config), []);

  const reason = 'CLI rejected this candidate.';
  const success = runRuntimeCli('runtime/cli/memoryReject.ts', [
    '--memory-dir',
    memoryDir,
    '--candidate',
    sampleCandidates[0].candidate_id,
    '--reason',
    reason,
  ]);
  const rejectionEvent = (await readAuditEvents(config)).find((event) => event.action === 'candidate_rejected');

  assert.equal(success.status, 0, success.stderr);
  assert.equal(rejectionEvent?.reason, reason);
  await rm(memoryDir, { recursive: true, force: true });
});

test('conflict detection handles Korean negation and duplicate text', () => {
  assert.ok(
    conflictTypesForGists(
      '이 프로젝트는 MCP 서버화를 고려한다',
      '이 프로젝트는 MCP 서버화를 고려하지 않는다',
    ).includes('direct_conflict'),
  );
  assert.ok(
    conflictTypesForGists(
      '서버를 사용할 수 있다',
      '서버를 사용하지 않는다',
    ).includes('direct_conflict'),
  );
  assert.ok(
    conflictTypesForGists(
      'This project may use a server for memory retrieval.',
      'This project must not use a server for memory retrieval.',
    ).includes('direct_conflict'),
  );
  assert.ok(
    conflictTypesForGists(
      '메모리 후보는 사용자 승인 후 저장된다',
      '메모리 후보는 사용자 승인 후 저장된다',
    ).includes('duplicate'),
  );
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

test('memory kind and type semantic combinations warn without failing validation', async () => {
  for (const memory of sampleMemories) {
    assert.deepEqual(validateMemorySemantics(memory), []);
  }

  for (const candidate of sampleCandidates) {
    assert.deepEqual(validateCandidateSemantics(candidate), []);
  }

  const memoryDir = await makeMemoryDir();
  const config = createMemoryConfig({ memoryDir });
  await writeJsonl(config.stores.memories.semantic, [
    cloneMemory(sampleMemories[0], {
      memory_id: 'mem_bad_kind_type',
      kind: 'semantic',
      memory_type: 'project_constraint',
    }),
  ]);
  await writeJsonl(config.stores.candidates.pending, [
    cloneCandidate(sampleCandidates[0], {
      candidate_id: 'cand_bad_kind_type',
      target_kind: 'episodic',
      memory_type: 'user_preference',
    }),
  ]);

  const result = await validateMemoryHarness({ memoryDir });

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some((warning) => warning.includes('mem_bad_kind_type') && warning.includes('project_constraint')));
  assert.ok(result.warnings.some((warning) => warning.includes('cand_bad_kind_type') && warning.includes('user_preference')));
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
