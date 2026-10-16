---
id: TASK-2.2
title: 'Idempotency — client-key replay (no duplicate writes on retry)'
status: Done
assignee: []
created_date: '2026-07-23'
updated_date: '2026-07-23'
labels:
  - pos-module-mcp
  - phase-2
  - idempotency
dependencies:
  - TASK-2.1
parent_task_id: TASK-2
priority: high
ordinal: 2200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Idempotency (spec §16.3). A tool declared `idempotent: true` accepts a client key
(`params._meta.idempotencyKey`); a retry with the same key for the same principal
returns the ORIGINAL result instead of re-executing — agents retry far more than
humans, and without this a retried mutating call duplicates the write. Key reuse
with different arguments is a client error (409). For mutating tools the
idempotency record commits INSIDE the business transaction, so the mutation and its
replay record are atomic.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Key read from MCP `params._meta.idempotencyKey` (top-level fallback). Applies only when the tool is `idempotent: true` and a key is present. Runs AFTER authorization so a cached result is never served to an unauthorized caller.
- [x] #2 Retry with same key + same args → replays the original result, does NOT re-execute. VERIFIED live: create_event twice with one key → same event id, and only ONE event row exists (no duplicate write).
- [x] #3 Same key + different args → 409 "Idempotency-Key reused with different arguments". VERIFIED live.
- [x] #4 Mutating: idempotency record commits INSIDE the transaction (atomic with the mutation) — a mutation never commits without its replay record; a rolled-back call leaves none (so a retry legitimately re-executes). Read: stored after execute. VERIFIED (idem row count 1 alongside the single event).
- [x] #5 Every path attested: original (execution_outcome success), replay (replayed), conflict (invalid) — all carrying the idempotency_key. VERIFIED live. Chain ok after.
- [x] #6 Expiry window (config.defaults.idempotency_window_seconds, default 86400) — entries past expires_at are ignored so a later reuse re-executes.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:IMPL:BEGIN -->
Files: schema/mcp_idempotency.yml (key, principal_id, tool_name, input_sha256,
response_json:text, expires_at:int); graphql/idempotency/{find,create}; lib/commands/
idempotency/{lookup,store}; lib/commands/execute/result_of (single result shape for
response + cache, so a replay is byte-identical); config defaults.idempotency_window
_seconds. Wired into rpc/tools_call step 7 (after authorize): lookup → replay /
409-conflict / proceed(idem_store=true). Store on success — INSIDE the mutating
transaction (with the ledger append, in the same try so a store failure also rolls
back), or after execute for reads.

Scoped by (key, principal) so one member's key can't replay another's result.
input_sha256 guards key reuse. `result | json` → store → parse_json round-trips
clean (assign context, not echo, so no HTML-escaping). KNOWN LIMIT (documented like
the ledger): no atomic check-and-set, so idempotency covers SEQUENTIAL retries (the
dominant real case — agent retries after a timeout), not simultaneous duplicate
requests; platformOS offers no Liquid advisory lock. create_event flipped to
idempotent:true as the live demo.
<!-- SECTION:IMPL:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Replay + conflict + no-duplicate-write verified live end-to-end
- [x] #2 platformos-check passes (deploy succeeded)
- [x] #3 Idempotency record atomic with mutation (in-tx); chain ok after
- [x] #4 Sequential-only concurrency limit documented honestly
- [ ] #5 Approval gate (task-2.3) — next subtask
<!-- DOD:END -->
