---
id: TASK-2.3
title: 'Approval gate — human-in-the-loop for high-impact actions'
status: Done
assignee: []
created_date: '2026-07-23'
updated_date: '2026-07-23'
labels:
  - pos-module-mcp
  - phase-2
  - approval
dependencies:
  - TASK-2.1
parent_task_id: TASK-2
priority: high
ordinal: 2300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human-in-the-loop gate (spec §9.6) — keeps genuinely high-impact actions
(refunds, account deletion, payout changes) out of autonomous execution while
still letting agents PROPOSE them. A `requires_approval: true` tool never executes
inline: it records the intent, returns an opaque handle, and only runs when an
operator approves — executing as the ORIGINAL principal, with a ledger entry linked
to the request. The agent polls a built-in `mcp_approval_status` tool.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A requires_approval tool never executes inline: creates an mcp_pending_approval row, returns an opaque handle + expiry + status pending_approval, attests execution_outcome:pending_approval. VERIFIED live (broadcast_event → handle, 0 events created).
- [x] #2 Built-in `mcp_approval_status` tool (injected by the engine, not app-registered) lets the agent poll; SELF-SCOPED — unknown handle and another principal's handle both return the same not-found (no enumeration). VERIFIED live (pending → executed → rejected).
- [x] #3 Operator approves in /mcp-admin → the action executes through the pipeline (re-resolve, re-validate, RE-AUTHORIZE) as the ORIGINAL principal, inside a transaction, attested. VERIFIED live: approve → event created, status executed, ledger success authz_reason approved_by:<op>.
- [x] #4 Request and execution are LINKED by request_id in the ledger. VERIFIED live (both entries share one request_id).
- [x] #5 Reject → action never runs, status rejected. VERIFIED live (0 events, status rejected). Expiry handled (expired approvals are not executed).
- [x] #6 The operator only DECIDES; execution carries the requester's identity/scope, never the operator's (re-authorized against the original principal, fail-closed).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:IMPL:BEGIN -->
Files: schema/mcp_pending_approval.yml (persists arguments_json — access-restricted,
unlike the ledger); graphql/approvals/{create,find_by_handle,list,update}; lib/
commands/approval/{create,execute}; lib/commands/builtin/approval_status; lib/
commands/is_operator (shared operator gate); views/pages/mcp-admin/{approve,reject}
(POST, operator-gated) + pending-approvals section in mcp-admin. config.defaults.
approval_window_seconds=604800.

tools_call step 7a (after authorize, before idempotency): requires_approval →
approval/create → return handle + pending_approval ledger. Built-in tool injected
in registry/build with the mcp_authenticated built-in policy (handled specially in
authorize/evaluate — an explicit named allow for engine built-ins that self-scope,
NOT an implicit allow). approval/execute re-resolves/re-validates/RE-AUTHORIZES as
the reconstructed original principal (id from principal_id, user_id via
remove_first 'user:'), then runs the same transaction-wrap + attest pattern as
tools_call (deferred-execution path; no idempotency — the handle is the dedup).
Demo tool: broadcast_event (requires_approval:true). Verified over HTTP end to end
(approve + reject) with a real operator browser session.
<!-- SECTION:IMPL:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Propose/approve/reject/poll verified live end-to-end
- [x] #2 platformos-check passes (deploy succeeded)
- [x] #3 Execution as original principal (re-authorized); request+execution linked
- [x] #4 Built-in status tool self-scoped (no handle enumeration)
- [x] #5 Test data cleaned; chain intact
<!-- DOD:END -->
