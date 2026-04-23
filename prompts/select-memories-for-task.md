# Select Memories For Task

This prompt must be executed with `prompts/base-memory-harness.md` prepended.

Use this prompt to select only the semantic and episodic memories that are genuinely useful for the current task.

```text
You are selecting memory for the current task.

Output schema:
`schemas/memory-selection.schema.json`

Return raw JSON only. Do not wrap the output in markdown fences.

Current task:
{{user_request}}

Task metadata:
{{task_metadata}}

Available semantic memories:
{{semantic_memories}}

Available recent episodic memories:
{{episodic_memories}}

Select only the memories that are genuinely useful for the current task.
Prefer:
- repo-specific rules
- user preferences relevant to this task
- recent failure lessons relevant to this task
- known constraints or approval boundaries
- important exceptions

Avoid:
- generic memories with no clear effect on the current task
- stale memories unless still likely valid
- redundant memories

For each selected memory:
- include its ID in `selected_semantic_ids` or `selected_episodic_ids`
- add a matching item to `notes`
- set `memory_kind` to `semantic` or `episodic`
- include `why_it_matters_now`
- include `relevance_to_task` and `confidence` as numbers between 0 and 1
- include at least one structured `evidence_refs` object with `source_type`, `source_id`, `quote_or_summary`, `observed_at`, and `trust_level`
- ensure every `notes[].memory_id` appears in one selected ID array

Use empty arrays when nothing is selected.

Example output:
{
  "selected_semantic_ids": ["mem_repo_rule_1"],
  "selected_episodic_ids": ["ep_validation_failure_2"],
  "notes": [
    {
      "memory_id": "mem_repo_rule_1",
      "memory_kind": "semantic",
      "why_it_matters_now": "It defines a repository-level constraint that directly affects the current task.",
      "relevance_to_task": 0.96,
      "confidence": 0.93,
      "evidence_refs": [
        {
          "source_type": "repo_config",
          "source_id": "AGENTS.md",
          "quote_or_summary": "The repository requires conservative memory handling and explicit uncertainty.",
          "observed_at": "2026-04-23T00:00:00Z",
          "trust_level": "trusted"
        }
      ]
    }
  ]
}
```
