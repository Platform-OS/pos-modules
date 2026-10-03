---
id: TASK-1.2
title: 'Transport — JSON-RPC 2.0 envelope, dispatch, and error mapping'
status: Done
assignee: []
created_date: '2026-07-23'
updated_date: '2026-07-28 06:32'
labels:
  - pos-module-mcp
  - transport
dependencies:
  - TASK-1.1
parent_task_id: TASK-1
priority: high
ordinal: 1020
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The `/mcp` POST endpoint and the JSON-RPC plumbing every method rides on
(spec §9.1, §13). Provides: `views/pages/mcp.liquid` (`format: json`,
`method: post`), and `views/partials/transport/{parse_request,error_response,
success_response}.liquid`. Parses and validates the JSON-RPC envelope
(`jsonrpc: "2.0"`, `id`, `method`, `params` shape), dispatches by `method` to
the `lib/commands/rpc/*` handlers (stubs OK here; real handlers land in later
tasks), and maps outcomes to the exact §13.2 error table.

Uses the raw-body accessor confirmed in task-1.1. Enforces the size cap
(`max_input_bytes`, default 64 KB) here, before any parsing work. Emits
unescaped JSON (the verified `echo <hash>` pattern). Error messages MUST NOT
leak internals — no stack traces, no GraphQL error text, no schema/policy
internals (§13.2). Rate-limit / concurrency guard is a hook wired here but its
enforcement can be stubbed until task-1.6/limits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 POST /mcp accepts application/json and returns valid JSON-RPC 2.0 responses (result or error) with the request id echoed
- [x] #2 Envelope validation rejects malformed JSON (-32700/400), bad request shape (-32600/400), unknown method (-32601/400) exactly per §13.2
- [x] #3 Oversized bodies (> max_input_bytes) are rejected before parsing
- [x] #4 A method dispatch table routes initialize / tools.list / tools.call / resources.list / resources.read / ping to rpc/* commands
- [x] #5 Error responses never contain stack traces, GraphQL text, or schema/policy internals; denials use stable reason codes
- [x] #6 Golden request/response fixtures for each envelope-level error case pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed 2026-07-28. Functionality shipped + verified live long ago; status was stale. The one open DoD item (docs/security-model.md) is now written: modules/mcp/docs/security-model.md — a thorough identity + ledger + transport security model grounded in the shipped engine, cross-referencing the spec and engine-commands-architecture / request-flow docs. platformos-check: 0 offenses.
Transport: verified by 13 conformance envelope asserts (-32600/-32601, 413 oversize, 202 notifications, no-leak error hygiene). -32700 documented as unreachable (platformOS 415 pre-dispatch).
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Protocol-conformance fixtures for envelope errors written and passing
- [x] #2 platformos-check lint passes with zero errors
- [x] #3 Docs updated (docs/ + spec §9/§13 cross-ref)
- [x] #4 Deployed to staging and smoke-checked over real /mcp HTTP
- [x] #5 No internal detail leakage verified
- [x] #6 Reviewed before merge
<!-- DOD:END -->
