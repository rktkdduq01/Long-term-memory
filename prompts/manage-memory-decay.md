# Manage Memory Decay

Use this prompt to manage long-term memory decay while preserving durable constraints and core gist.

```text
You are managing memory decay for long-term memory.

Memories:
{{semantic_memories}}

Usage history:
{{usage_history}}

Apply these principles:
- Frequently reused and high-confidence memories should remain stable.
- Rarely used memories may lose detail before being archived.
- If a memory has not been used for a long time and has weak evidence, lower confidence.
- Preserve core gist longer than detailed context.
- Do not delete memories that still define safety, approval, or hard project constraints.

Return JSON:
{
  "updates": [
    {
      "memory_id": "",
      "new_confidence": 0.0,
      "new_decay_state": "stable|fading|archived",
      "detail_reduction": "none|light|moderate|strong",
      "reason": ""
    }
  ]
}
```
