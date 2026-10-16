---
id: DEC-3
title: Ledger immutability = append-only-by-construction + hash-chain tamper-evidence
date: '2026-07-23'
status: accepted
---

## Context

Spec §6.1/§12.6 call for a `mcp_ledger_immutable` authorization policy that denies
`update`/`delete` on the ledger to ALL identities, including admins.

## Platform reality

platformOS has no table-level mutation ACL that can refuse the instance admin API
token — that token is god-mode by design (it can `record_update`/`record_delete`/
`records_delete_all` any table, and `admin_model_schema_delete` any schema). No
app- or module-level authorization policy intercepts direct admin-API mutations,
because authorization policies gate PAGES/queries, not raw admin mutations. So a
literal "deny update/delete to all including admin" is not achievable on this
platform, and claiming it would be false security.

## Decision — the real, honest controls

Ledger immutability is enforced by two mechanisms that ARE real here:

1. **Append-only by construction.** The module contains NO update/delete path for
   `modules/mcp/mcp_ledger`. `ledger/append` only ever `record_create`s; there is
   no ledger-mutation graphql or command anywhere in the engine. Nothing an agent
   or a tool handler can invoke edits the ledger. (Handler rule §7.3 also forbids
   handlers writing the ledger directly.)

2. **Hash-chain tamper-evidence.** Every entry chains to its predecessor
   (`entry_hash = digest(canonical(payload) || prev_entry_hash)`). Any out-of-band
   edit, delete, backdate, or reorder — even by an actor holding the admin token —
   BREAKS the chain and is detected by `ledger/verify_chain`, which pinpoints the
   first broken seq. VERIFIED live in task-1.7 (edited a row via record_update →
   verify_chain returned ok:false, broken_at:2).

This matches the spec's own threat mapping (§12.1): "Backdated or tampered audit
logs → Hash-chained ledger". The chain is the load-bearing control; the deny
"policy" is not implementable as literal DB enforcement here. Retention is
export-then-purge under an explicit, itself-logged admin action (§6.1) — a
deliberate operation, never ad-hoc mutation.

## Consequence

- No `mcp_ledger_immutable` tool policy is shipped (it would be theatre — tools
  never touch the ledger table anyway).
- `mcp_admin_only` IS shipped (app policy template) and will gate the admin ledger
  VIEW page (task-1.9), which is a real page-level authorization surface.
- Partner/security docs must state the tamper-EVIDENCE (detect) posture plainly,
  not claim tamper-PREVENTION against a privileged insider.
