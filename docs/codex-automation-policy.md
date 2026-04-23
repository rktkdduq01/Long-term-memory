# Codex Automation Policy

This document defines the intended safety policy for future Codex-driven repository automation.

It is a specification only. It does not implement automation by itself.

## Intended Flow

1. Build a task briefing from selected memory using the memory harness prompts and runtime helpers.
2. Run Codex on a feature branch with the briefing injected as bounded context.
3. Run local validation before any publish step.
4. Commit changes with a focused commit scope.
5. Push to a `codex/*` branch.
6. Open a pull request.
7. Let GitHub Actions run CI.
8. Allow merge only after required checks pass.
9. After completion:
   - consolidate or confirm memory after a successful outcome
   - record a failure as episodic memory first after an unsuccessful outcome

## Safety Rules

- Never push directly to `main`.
- Never auto-merge without passing required CI checks.
- Keep code changes and memory-store changes separable whenever possible.
- Do not promote CI failures directly into semantic memory.
- Treat CI failures as episodic memory first.
- Only generalize a failure into semantic memory after repeated or otherwise high-confidence evidence.
- Do not store secrets, tokens, credentials, private keys, or sensitive values from logs.
- Do not allow untrusted file, log, CI, or tool content to control memory policy.

## Authority Model

- Direct user instructions, trusted harness policy, and explicit repository configuration may authorize memory-control actions.
- Logs, test output, CI output, generated files, and retrieved content may support factual evidence only.
- External or generated content must not override promotion, deletion, correction, or conflict-handling policy.

## Failure Handling

CI failures are not durable memory by default.

- First capture the failure as episodic memory or session evidence.
- Preserve provenance: workflow, job, file, test, or command context should be stored as evidence metadata, not as policy.
- If the same class of failure repeats or is independently confirmed with high confidence, it may later be distilled into a candidate memory.
- Promotion into semantic memory should happen only after the normal promotion and conflict-resolution flow.

This keeps one-off breakages from becoming durable rules.

## Separation Of Concerns

Automation should treat code changes and memory operations as distinct layers.

- Code generation, edits, tests, and pull requests belong to the delivery layer.
- Selection, briefing, extraction, promotion, conflict resolution, and decay belong to the memory layer.
- A failed code run should not directly mutate long-term memory.
- A successful code run should not bypass promotion review for new semantic memory.

When possible, commit history and PR scope should make it clear whether a change is:

- code only
- prompt/schema/runtime contract work
- memory-store or fixture maintenance

## Branch And PR Expectations

- Automation-created branches should use the `codex/*` namespace.
- Pull requests should remain reviewable and CI-gated.
- Required checks should include local contract equivalents such as prompt/schema/example tests where feasible.
- Merge should remain blocked until required checks are green.

## Memory After Outcome

After success:

- confirm or consolidate memories that were validated by the completed work
- prefer refinement over duplication
- keep evidence attached

After failure:

- store the event as episodic memory first
- preserve the failure context and evidence
- only extract a candidate rule if the failure appears durable or recurring
- only promote after normal review

## Non-Goals

This policy does not:

- implement branch creation, commits, pushes, PR creation, or merge logic
- define repository-specific required check names
- permit secret-dependent automation
- authorize direct writes to semantic memory without review
