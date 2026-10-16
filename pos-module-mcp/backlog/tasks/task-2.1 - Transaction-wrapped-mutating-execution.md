---
id: TASK-2.1
title: 'Transaction-wrapped mutating execution (atomic write + attest)'
status: Done
assignee: []
created_date: '2026-07-23'
updated_date: '2026-07-23'
labels:
  - pos-module-mcp
  - phase-2
  - transactions
dependencies:
  - TASK-1.7
  - TASK-1.8
parent_task_id: TASK-2
priority: high
ordinal: 2100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The reversibility guarantee (spec §11.1, §4.3) — the control that makes an operator
willing to let an agent WRITE. A `mutating: true` tool runs its handler AND its
ledger attestation inside ONE `{% transaction %}`: on success both commit together
(an action cannot exist without its attestation); on handler failure, a thrown
handler, or a failed ledger append, the whole thing rolls back (no partial state)
and a `rolled_back` entry is written OUTSIDE the transaction so the failure is still
audited (§9.3).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Page-context transaction/rollback confirmed (Phase-2 gate): record_create inside a tx + rollback → 0 rows, page 200, execution continues (decision-1 update). Spike removed.
- [x] #2 Mutating tools run handler + success-attestation in one transaction; both commit together. VERIFIED live: create_event → event 115 persists AND ledger success entry with subject record:115.
- [x] #3 Handler failure (ok:false / throw) rolls back the mutation; a rolled_back entry is recorded outside the tx. VERIFIED live: probe_rollback created an event then failed → 0 "ROLLBACK PROBE MARKER" events persist, ledger shows execution_outcome:rolled_back, subject null, authz allow.
- [x] #4 Ledger-append failure inside the tx also rolls back the mutation (try/catch → rollback) — an action never commits without its attestation.
- [x] #5 Chain integrity preserved: rolled-back in-tx appends never enter the chain; verify_chain ok after commit+rollback sequence (count reflects only committed entries).
- [x] #6 Read (non-mutating) path unchanged (no transaction); mutating branch selected by manifest.mutating.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:IMPL:BEGIN -->
rpc/tools_call: execute+attest branches on tool.mutating. Mutating branch wraps
`function exec = execute/run` + the success ledger append in `{% transaction %}`;
`if exec.outcome=='success'` → append (try/catch; append failure → rollback) →
committed=true; else → rollback. After endtransaction, `unless committed` → append a
rolled_back entry (outside tx). KEY platformOS fact (spike-verified): Liquid vars
assigned inside a transaction SURVIVE rollback (they are in-memory, not DB), so
`exec` is available for the response on both paths; and rollback does NOT abort the
page (continues past endtransaction, HTTP 200).

Layer-2 demo: app/views/partials/mcp/tools/create_event/{manifest(mutating:true),call}
+ app/graphql/mcp/create_event.graphql (typed vars) + policy members_can_write.
Rollback proven with a TRANSIENT probe_rollback tool (create-then-fail), verified
over HTTP, then removed — no test hooks in shipped tools.
<!-- SECTION:IMPL:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Transaction commit + rollback verified live end-to-end
- [x] #2 platformos-check passes (deploy succeeded)
- [x] #3 Chain integrity verified after commit+rollback
- [x] #4 No test hooks in production tools; transient probe removed
- [ ] #5 Idempotency (task-2.2) + approval gate (task-2.3) — separate subtasks
<!-- DOD:END -->
