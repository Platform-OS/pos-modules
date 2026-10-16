---
id: TASK-4
title: 'Phase 4 — streaming, async job handles, dynamic discovery, sessions'
status: To Do
assignee: []
created_date: '2026-07-23'
updated_date: '2026-07-23'
labels:
  - pos-module-mcp
  - phase-4
dependencies:
  - TASK-3
parent_task_id: ''
priority: low
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The deferred, investigation-gated surface (spec §16, §14.3, §11.4, §21). Do NOT
commit timelines before the §18.6 investigation concludes. Break into subtasks:
- **Streaming (§16.2, §18.6 — INVESTIGATION, not a commitment):** MCP streamable
  HTTP / SSE for progress + server-initiated messages. Holding SSE connections
  is not what pOS pages are built for; whether the WebSockets broadcast composes
  into MCP's SSE expectation is an open question. Conclude the investigation
  FIRST; only then scope `*/list_changed` notifications.
- **Async job handles hardened (§16.1):** tools that enqueue work return a
  job_handle + status:accepted; `mcp_job_status(job_handle)` returns
  pending/done/failed + result ref; async tools say so in their description.
  Note the reusable "has async work settled?" quiescence primitive shared with
  E2E test tooling — scope it once, not twice.
- **Dynamic tool discovery (§14.3):** search over tool names/descriptions so
  agents retrieve a relevant subset rather than the full list (cuts MCP token
  usage at scale).
- **Transactional sessions (§11.4):** optional multi-call session wrapped in one
  transaction with explicit commit/abort — weighed against long-held locks.
- **Optional dynamic registry (§8.3):** `mcp_tool_registration` merge, admin-
  authored, two-person review (reviewed_by ≠ authored_by), handler_path must
  resolve to an existing file handler (no new executable code), every transition
  ledgered. Off by default; document the "injection surface becomes data" trade.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 SSE/WebSockets composition investigation (§18.6) concluded and documented BEFORE any streaming commitment
- [ ] #2 Async tools return a job_handle; mcp_job_status reports pending/done/failed + result ref; the shared quiescence primitive is scoped
- [ ] #3 Dynamic tool discovery (search over names/descriptions) returns a relevant subset with pagination
- [ ] #4 Transactional sessions (if built) bound lock duration; commit/abort explicit
- [ ] #5 Optional dynamic registry (if enabled) enforces two-person review, existing-handler-only, and ledgers every transition; off by default with the trade-off documented
- [ ] #6 */list_changed notifications only after streaming lands
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Tests written and passing for whichever sub-capabilities ship
- [ ] #2 platformos-check lint passes with zero errors
- [ ] #3 Docs updated (spec §16/§8.3/§11.4 cross-ref; streaming investigation writeup)
- [ ] #4 Deployed to staging and smoke-checked
- [ ] #5 Security invariants verified — dynamic registry two-person-reviewed + existing-handler-only; no new escape hatch
- [ ] #6 Reviewed before merge
<!-- DOD:END -->
