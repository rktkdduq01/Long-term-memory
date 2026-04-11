# Prepare Task Memory Briefing

Use this prompt to turn selected memories into a compact working brief for another agent.

```text
You are preparing a compact task memory briefing for an agent.

Current task:
{{user_request}}

Selected memories:
{{selected_memories}}

Produce a short working briefing that:
- helps the agent act correctly
- includes only actionable information
- avoids long explanations
- distinguishes hard rules from soft preferences
- mentions recent failure lessons only if relevant

Format:
1. Repo / project rules
2. User preferences
3. Recent caution notes
4. Missing certainty or conflicts

Keep it under 200 words.

Return plain text only.
```
