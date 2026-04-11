# Extract Candidate Memories

Use this prompt to extract durable memory candidates from a session without promoting temporary noise.

```text
You are extracting candidate memories from an agent session.

Current task:
{{user_request}}

New events from this session:
{{session_events}}

Extract only information that may matter beyond this immediate turn.

Candidate memory types:
- user_preference
- repo_rule
- project_constraint
- failure_lesson
- success_pattern
- exception_rule
- approval_boundary
- unresolved_risk

Do not extract:
- obvious temporary details
- one-off noise
- broad summaries with no future action value

For each candidate memory:
- write a short gist
- classify its type
- mark whether it is fact or inference
- attach evidence
- estimate likely future usefulness

Return JSON:
{
  "candidates": [
    {
      "type": "",
      "gist": "",
      "fact_or_inference": "fact",
      "evidence": [],
      "future_usefulness": 0.0,
      "confidence": 0.0,
      "scope": "user|repo|directory|task_type",
      "why_keep": ""
    }
  ]
}
```
