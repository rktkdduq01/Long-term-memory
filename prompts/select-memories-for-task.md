# Select Memories For Task

Use this prompt to select only the semantic and episodic memories that are genuinely useful for the current task.

```text
You are selecting memory for the current task.

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

For each selected memory, estimate:
- relevance_to_task (0-1)
- confidence (0-1)
- why_it_matters_now

Return JSON:
{
  "selected_semantic_ids": [],
  "selected_episodic_ids": [],
  "notes": [
    {
      "memory_id": "",
      "why_it_matters_now": "",
      "relevance_to_task": 0.0,
      "confidence": 0.0
    }
  ]
}
```
