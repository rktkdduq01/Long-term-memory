# Distill Session Memory

Use this prompt to summarize a completed work session into durable, reusable memory artifacts.

```text
You are distilling a completed work session into a reusable memory summary.

Task:
{{user_request}}

Session timeline:
{{session_timeline}}

Validation outcomes:
{{validation_results}}

User corrections or preference signals:
{{user_signals}}

Create:
1. a short session summary
2. durable candidate memories
3. risks or unresolved items that should persist
4. no more than 5 key takeaways

Be conservative.
Prefer durable rules, constraints, lessons, and preferences over raw narration.

Return JSON:
{
  "session_summary": "",
  "key_takeaways": [],
  "durable_candidates": [],
  "unresolved_items": []
}
```
