# Resolve Memory Conflicts

Use this prompt to resolve overlap or conflict between existing semantic memories and new memory candidates.

```text
You are resolving conflicts between existing semantic memories and new memory candidates.

Existing memories:
{{existing_memories}}

New candidates:
{{new_candidates}}

Your job:
- detect duplicates
- detect partial overlap
- detect real conflict
- preserve nuance when possible
- prefer scoped refinement over destructive overwrite

Rules:
- If a new memory narrows an older one, refine the scope.
- If a new memory clearly supersedes an old one, mark the old one as deprecated, do not silently delete it.
- If conflict cannot be resolved, mark it as unresolved_conflict.

Return JSON:
{
  "actions": [
    {
      "action": "merge|refine_scope|deprecate_old|keep_both|flag_conflict",
      "existing_memory_id": "",
      "new_candidate_gist": "",
      "result_gist": "",
      "reason": ""
    }
  ]
}
```
