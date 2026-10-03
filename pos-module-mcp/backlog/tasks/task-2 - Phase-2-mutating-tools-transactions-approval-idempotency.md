---
id: TASK-2
title: 'Phase 2 — mutating tools: transactions, approval gate, idempotency'
status: Done
assignee: []
created_date: '2026-07-23'
updated_date: '2026-07-23'
labels:
  - pos-module-mcp
  - phase-2
dependencies:
  - TASK-1
parent_task_id: ''
priority: medium
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Enable `mutating: true` tools on top of the Phase-1 read server (spec §11, §9.6,
§16.3, §21). Break into subtasks when picked up; the shape:
- **Transaction wrapping (§11.1):** every mutating handler runs inside
  `{% transaction %}` with `rollback` on handler error, runtime error, timeout,
  guardrail rejection, or ledger-append failure. Attestation commits/fails WITH
  the mutation (§4.3 — the seam is already in task-1.7). Verified: tags work
  (decision-1).
- **External side effects (§11.3):** handlers must not perform irreversible
  external effects inline; enqueue as post-commit background work; tools whose
  purpose IS an irreversible external effect set `requires_approval: true`.
  Document the limitation honestly in partner materials.
- **Approval gate (§9.6):** `mcp_pending_approval` schema; `requires_approval`
  tools never execute inline — create a pending row, return an opaque handle +
  expiry; provide `mcp_approval_status`; operator approval re-enters the pipeline
  with a linked ledger entry. Arguments persisted here (unlike the ledger),
  admin-restricted, purged on short cycle after terminal status.
- **Idempotency (§16.3):** `idempotent:true` tools accept a client idempotency
  key stored with the ledger entry; repeat within window returns the original
  result instead of re-executing.
- Rollback metrics + the adversarial "concurrent conflicting mutations on same
  subject" case (§19.2) complete here.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Mutating handlers are transaction-wrapped; any failure rolls back business mutation AND ledger append atomically (no partial writes — tested at each failure point)
- [ ] #2 requires_approval:true tools never execute inline: pending row + handle + expiry returned; mcp_approval_status works; operator approval re-enters the pipeline with a linked ledger entry
- [ ] #3 External irreversible effects are never inline; enqueued post-commit with a returned job handle; irreversible-effect tools require approval
- [ ] #4 idempotent:true tools dedupe by client key within the window and return the original result
- [ ] #5 Rollback-rate metric + concurrent-conflicting-mutation adversarial test added and passing
- [ ] #6 mcp_pending_approval is admin-restricted and purged after terminal status
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Transaction/approval/idempotency tests written and passing (incl. failure-at-each-step no-partial-write)
- [ ] #2 platformos-check lint passes with zero errors
- [ ] #3 Docs updated (docs/security-model.md reversibility limits, honestly stated + spec §11 cross-ref)
- [ ] #4 Deployed to staging; a mutating community tool proven to roll back cleanly on induced failure
- [ ] #5 Security invariants verified — no inline irreversible effects; approval gate unbypassable; ledger atomic with mutation
- [ ] #6 Reviewed before merge
<!-- DOD:END -->
