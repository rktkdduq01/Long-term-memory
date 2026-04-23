# Prepare Task Memory Briefing

This prompt must be executed with `prompts/base-memory-harness.md` prepended.

Use this prompt to turn selected memories into a compact working brief for another agent.

```text
You are preparing a compact task memory briefing for an agent.

Output schema:
`schemas/memory-briefing.schema.json`

Return raw JSON only. Do not wrap the output in markdown fences.

Current task:
{{user_request}}

Selected memories:
{{selected_memories}}

Produce a structured working briefing that:
- helps the agent act correctly
- includes only actionable information
- avoids long explanations
- distinguishes hard rules from soft preferences
- mentions recent failure lessons only if relevant

Populate:
- `hard_rules`: non-negotiable repo rules, project constraints, approval boundaries, or exception rules
- `soft_preferences`: user preferences or guidance that should shape execution style but are not hard requirements
- `recent_cautions`: recent failures, regressions, or operational risks that are relevant now
- `uncertainties`: weak, stale, incomplete, or otherwise uncertain memory that may matter now
- `conflicts`: unresolved contradictions between memories or between memory and current task context
- `rendered_briefing`: a compact final briefing that can be injected into Codex directly

Rules:
- `hard_rules` must contain only constraints that should be treated as mandatory.
- `soft_preferences` must contain preferences that may be overridden by task-specific instructions.
- `recent_cautions` should include only directly relevant failure lessons.
- `uncertainties` should identify weak or stale memory.
- `conflicts` should identify unresolved contradictions.
- Keep every array item concise. Use strings, not nested objects.

Keep `rendered_briefing` under 200 words.
Use empty arrays for categories with no relevant items.

Example output:
{
  "hard_rules": [
    "Do not promote low-evidence memories into durable storage."
  ],
  "soft_preferences": [],
  "recent_cautions": [
    "Recent validation drift suggests checking schema field names carefully."
  ],
  "uncertainties": [
    "One older caution memory may be stale because it has not been reconfirmed recently."
  ],
  "conflicts": [],
  "rendered_briefing": "Hard rule: preserve provenance, uncertainty, and conflict markers. Recent caution: validate field names against the active schema before emitting output."
}
```
