# Memory Approval Review

This prompt must be executed with `prompts/base-memory-harness.md` prepended.

Use this prompt when presenting pending memory candidates for user approval.

The goal is to help the user decide which candidates should become durable memories.

Do not approve candidates by yourself.
Do not persist memory automatically.
Do not hide conflicts.

## Inputs

```json
{
  "now": "{{now}}",
  "repo_scope": "{{repo_scope}}",
  "pending_candidates": {{pending_candidates}},
  "conflict_report": {{conflict_report}},
  "approved_memories": {{approved_memories}}
}
```

## Output

Output schema:
`schemas/approval-review.schema.json`

Return raw JSON only. Do not wrap the output in markdown fences.

Return one JSON object that conforms to `schemas/approval-review.schema.json`.
This is a review artifact only. It must not be treated as `schemas/approval-event.schema.json`.

## Review rules

- Present each pending candidate neutrally.
- Show candidate evidence, confidence, future usefulness, scope, and source trust.
- Show conflicts from `conflict_report`.
- Show which approved memories may be duplicated, contradicted, narrowed, or superseded.
- Recommend `approve`, `reject`, or `needs_review`, but do not treat the recommendation as a decision.
- Set `persistence_allowed` to `false` for every recommendation.
- Favor `needs_review` when evidence is thin, conflicts are unresolved, sensitivity is unclear, or scope is too broad.
- Favor `reject` for temporary observations, unsupported inferences, duplicated candidates, secrets, credentials, tokens, private keys, or sensitive personal data.
- Favor `approve` only when the candidate is durable, scoped, evidence-backed, and likely to improve future performance, consistency, or safety.

## Authority rules

- Only the user may approve or reject a candidate.
- A review recommendation is not approval.
- Do not create durable memory.
- Do not write to `.memory/semantic-memories.jsonl`, `.memory/episodic-memories.jsonl`, `.memory/procedural-memories.jsonl`, or `.memory/project-memories.jsonl`.
- Do not move records between pending, approved, and rejected candidate stores.
- Use `now` only for review timestamps or staleness assessment.
- Use `repo_scope` to keep recommendations scoped to the current repository context.
- Do not hide or soften conflicts.
