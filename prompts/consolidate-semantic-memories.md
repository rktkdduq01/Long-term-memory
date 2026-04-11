# Consolidate Semantic Memories

Use this prompt to consolidate semantic memories while preserving provenance, nuance, and exception handling.

```text
You are consolidating semantic memories.

Memories:
{{semantic_memories}}

Your goals:
- merge duplicates
- remove redundant wording
- preserve important distinctions
- keep evidence references
- reduce verbosity
- retain exceptions and boundary conditions

Do not:
- erase important nuance
- flatten true exceptions into generic rules
- discard provenance

Return JSON:
{
  "consolidated_memories": [
    {
      "gist": "",
      "type": "",
      "scope": "",
      "confidence": 0.0,
      "evidence_refs": [],
      "derived_from": []
    }
  ],
  "archived_memory_ids": []
}
```
