# Memory State Machine

The local harness uses a short approval lifecycle:

`session event -> candidate -> pending -> approved memory`

Candidates can also move from `pending` to `rejected`.

## Candidate States

| State | Meaning |
| --- | --- |
| `pending` | Generated from local session evidence and awaiting explicit user review. |
| `approved` | User approved the candidate; it has been copied into the relevant durable memory JSONL store. |
| `rejected` | User rejected the candidate; it must not be used as durable memory. |

## Memory States

| State | Meaning |
| --- | --- |
| `active` | Approved memory eligible for retrieval and briefing. |
| `superseded` | Approved memory replaced by a newer approved memory while retaining provenance. |
| `archived` | Retained for audit or historical review but not normal briefing. |
| `deprecated` | Retained as no longer recommended. |

No state transition may write permanent memory without explicit user approval.
