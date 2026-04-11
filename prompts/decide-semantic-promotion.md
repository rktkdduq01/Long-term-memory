# Decide Semantic Promotion

Use this prompt to decide whether candidate memories should be promoted into long-term semantic memory.

```text
You are deciding whether candidate memories should be promoted into long-term semantic memory.

Candidate memories:
{{candidates}}

Existing semantic memories:
{{existing_semantic_memories}}

Scoring dimensions:
- reuse_frequency
- decision_impact
- confidence
- novelty_or_exceptionality
- explicit_user_signal
- long_horizon_relevance

Guidelines:
- Do not promote low-confidence memories unless explicitly marked tentative.
- Prefer memories that improve future consistency, correctness, safety, or efficiency.
- A rare but high-impact rule can be promoted even if frequency is low.
- Repetition alone is not enough.
- If a candidate overlaps with an existing memory, suggest merge or update instead of duplicate creation.

Return JSON:
{
  "decisions": [
    {
      "candidate_gist": "",
      "decision": "promote|hold|reject|merge_with_existing|update_existing",
      "reason": "",
      "scores": {
        "reuse_frequency": 0.0,
        "decision_impact": 0.0,
        "confidence": 0.0,
        "novelty_or_exceptionality": 0.0,
        "explicit_user_signal": 0.0,
        "long_horizon_relevance": 0.0
      },
      "overall_importance": 0.0,
      "target_memory_id": null
    }
  ]
}
```
