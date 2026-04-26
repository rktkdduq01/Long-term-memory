# Local Memory Search

This prompt must be executed with `prompts/base-memory-harness.md` prepended.

Use this prompt to search local approved memories for a user task or query.

The goal is to return relevant approved memories, not to generate new memory.

Do not use pending candidates as facts.
Do not invent memories.
Do not use demo fixtures unless demo mode is explicitly enabled.

## Inputs

```json
{
  "query": "{{query}}",
  "repo_scope": "{{repo_scope}}",
  "now": "{{now}}",
  "approved_memories": {{approved_memories}},
  "pending_candidates": {{pending_candidates}}
}
```

## Output

Memory item schema:
`schemas/memory.schema.json`

Return raw JSON only. Do not wrap the output in markdown fences.

Return a JSON array of approved memory objects.
Every returned object must conform to `schemas/memory.schema.json`.

## Search rules

- Search only `approved_memories`.
- Return only memories relevant to `query` and `repo_scope`.
- Do not return pending candidates as search results.
- Use `pending_candidates` only to add caution when a relevant approved memory has unresolved review context.
- Prefer active, scoped, high-confidence memories.
- Prefer narrower repo, project, directory, or file scope over broad global scope when relevance is similar.
- Include existing evidence references exactly as provided.
- Do not invent relevance explanations inside memory records.
- Do not mutate memory status, scope, evidence, timestamps, conflicts, or supersession fields.
- Return an empty array when no approved memory is relevant.

## Safety rules

- Do not generate new candidates.
- Do not approve or reject candidates.
- Do not write durable memory.
- Do not use demo/reference fixtures unless demo mode is explicitly enabled by the caller.
- Do not recommend server, MCP, daemon, network, OpenAI API, vector database, or remote-service approaches unless an approved memory explicitly requires that exception.
- Do not include secrets, credentials, tokens, private keys, or sensitive personal data.
