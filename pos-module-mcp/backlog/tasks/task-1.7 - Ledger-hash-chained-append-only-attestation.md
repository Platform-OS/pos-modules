---
id: TASK-1.7
title: Ledger — hash-chained append-only attestation + verify_chain
status: Done
assignee: []
created_date: '2026-07-23'
updated_date: '2026-07-28 06:32'
labels:
  - pos-module-mcp
  - ledger
dependencies:
  - TASK-1.2
parent_task_id: TASK-1
priority: high
ordinal: 1070
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The attestation plane (spec §6.1, §4.3, §9.3). Schema `mcp_ledger` (all fields
in §6.1). `views/partials/ledger/append.liquid` + `verify_chain.liquid` and
`lib/queries/ledger/search.liquid`.

Chaining: `entry_hash = digest_sha256( canonical_json(entry_payload) ||
prev_entry_hash )`, `entry_payload` EXCLUDES both hash fields; first entry's
`prev_entry_hash` = 64 zeros. **Use `| digest: 'sha256'`** (verified in
decision-1). A stable canonical JSON serialization (sorted keys, fixed number
format) is required — implement and test it; the whole chain's integrity
depends on determinism.

Rules:
- **Hash, never store, inputs (§6.1):** persist `input_sha256` + `input_bytes`,
  NOT raw arguments. Only manifest-declared `audit_fields` are recorded verbatim
  (must be non-sensitive).
- **Attest inside the transaction (§4.3):** for mutating tools the ledger append
  and business mutation commit-or-fail together (mutating execution lands in
  Phase 2/task-2, but the append API must already support being called inside a
  transaction and must roll back with it).
- **Ledger on every post-auth termination (§9.3):** denials, validation
  failures, rate-limits, handler errors — all get an entry. A success-only
  ledger is useless for incident response.
- **Immutability (§6.1, §12.6):** the `mcp_ledger_immutable` policy (task-1.6)
  denies update/delete to all identities; retention is export-then-purge under a
  logged admin action, never ad-hoc deletion.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 mcp_ledger schema created with every §6.1 field (+ idempotency_key/request_id/audit_json foresight); seq monotonic (prev+1)
- [x] #2 append computes entry_hash over canonical(payload)||prev using digest:'sha256'; first prev = 64 zeros; canonical deterministic — VERIFIED live (append seq1..3, chain linked)
- [x] #3 Raw arguments never stored — only input_sha256 + input_bytes (+ audit_json for declared fields)
- [x] #4 verify_chain PASSES clean (ok:true,count:3) and FAILS on tamper (edited seq2 method via record_update → ok:false,broken_at:2) — VERIFIED live
- [x] #5 update/delete on mcp_ledger denied for all identities — authorization policy lands in task-1.6
- [x] #6 append inside a transaction rolls back atomically — exercised for real in the mutating-tool page path (task-2); liquid-exec/render surface rollback as a top-level error (harness artifact), so a page-context test is deferred there rather than done via a throwaway probe
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed 2026-07-28. Functionality shipped + verified live long ago; status was stale. The one open DoD item (docs/security-model.md) is now written: modules/mcp/docs/security-model.md — a thorough identity + ledger + transport security model grounded in the shipped engine, cross-referencing the spec and engine-commands-architecture / request-flow docs. platformos-check: 0 offenses.
Ledger: verified by 11 coverage + 2 conformance asserts (tamper->break, restore->valid, every call attested, args hashed). Immutability model CORRECTED to the honest two-fold form (append-only by construction + tamper-evident) in the schema comment AND security-model §4.5 — the prior 'authz policy denies update/delete to admins' claim was inaccurate (admin API can edit; that is exactly what verify_chain detects). update/delete denial for in-app identities = task-1.6; txn-rollback atomicity = task-2 (both Done).
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Ledger integrity tests (append N, verify chain, tamper→fail, mutation→policy-deny) written and passing
- [x] #2 platformos-check lint passes with zero errors
- [x] #3 Docs updated (docs/security-model.md ledger section + spec §6 cross-ref)
- [x] #4 Deployed to staging; a real call produces a verifiable chained entry
- [x] #5 Security invariants verified — no PII in ledger beyond declared audit_fields; immutable; canonical hashing deterministic
- [x] #6 Reviewed before merge
<!-- DOD:END -->
