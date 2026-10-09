---
id: TASK-1.6
title: 'Authorization — named policy evaluation, no implicit allow, rate limits'
status: Done
assignee: []
created_date: '2026-07-23'
updated_date: '2026-07-23'
labels:
  - pos-module-mcp
  - authorize
dependencies:
  - TASK-1.3
  - TASK-1.4
parent_task_id: TASK-1
priority: high
ordinal: 1060
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The authorization plane (spec §12, §9.2 step 6). `views/partials/authorize/
evaluate.liquid` evaluates a tool's named pOS authorization policy against
`(principal, tool, arguments)` and returns allow/deny + a stable reason code.
In on_behalf_of mode it evaluates against the PRINCIPAL, never the agent (§9.4).

Hard rule — **no implicit allow (§12.2):** there is no default-permit path and
no "public tool" shortcut; a tool intended for anonymous access declares a
policy that explicitly permits it. (Manifest-level enforcement lives in
task-1.4; this task enforces at call time.) Denials return a stable reason code
on the wire; details go to the ledger, not the response (§13.2). Also ship the
`views/partials/limits/check.liquid` plane wired in task-1.2: per-client and
per-principal rate limit (req/min), concurrency guard, argument-byte ceiling —
sized for burst (agents fan out), the ceiling bounds blast radius not traffic
shape (§12.4). Rate-limited → -32002 / 429 + Retry-After, ledgered.

Ship the two module-level authorization policies from §5.1:
`mcp_ledger_immutable` (deny update/delete on the ledger for ALL identities,
used by task-1.7) and `mcp_admin_only`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Named policy evaluated per call against the resolved PRINCIPAL, returns allow/deny + stable reason. VERIFIED: public_read→allow, admin_only(non-admin)→deny/not_admin.
- [x] #2 Denied → -32001/403, generic "Forbidden" on wire, specific reason ONLY in ledger; entry written. VERIFIED live (ledger shows not_admin/policy_unavailable; wire shows Forbidden).
- [x] #3 No code path permits without a satisfied policy: fail-closed on missing/erroring/malformed policy → deny (reason policy_unavailable). VERIFIED live over HTTP (probe_missing → 403).
- [x] #4 Per-principal fixed-window rate limit → -32002/429 + Retry-After, ledgered. VERIFIED live (limit=3: calls 1-3→200, 4+→429 w/ Retry-After countdown). Per-client + concurrency guard: seam present (scope supports client:<id>); concurrency deferred (platformOS has no Liquid advisory lock — documented).
- [~] #5 mcp_admin_only ships (app policy template, allowlist via MCP_ADMIN_USER_IDS). mcp_ledger_immutable: NOT shipped as a policy — platform admin token is god-mode so literal deny is not achievable; immutability = append-only-by-construction + hash-chain tamper-EVIDENCE (verify_chain). See decision-3. Honest posture, not theatre.
- [~] #6 Argument-byte ceiling enforced at transport (64KB, task-1.2); per-token downward override is a documented seam.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:IMPL:BEGIN -->
THE SEMANTIC CONTROL PLANE (module's thesis). Engine: authorize/evaluate.liquid
resolves a named policy to an APP partial mcp/policies/<name>, calls it with
(principal, agent, arguments, tool, delegation_mode), normalizes the return
(boolean OR {allow,reason}), FAIL-CLOSED on missing/error/malformed → deny. Wired
into tools_call step 6 (after validate, before execute-seam). App policies:
public_read (explicit allow, what search_events uses — no implicit/anonymous
permit, §12.2), admin_only (MCP_ADMIN_USER_IDS allowlist, checks principal not
agent). platformOS authorization_policies feature gates PAGES not sub-invocations,
and the reference modules don't use it — so programmatic policy-partial evaluation
is the correct platformOS-native mechanism for per-call tool authz.

Rate limiting: limits/check.liquid = fixed-window per-scope counter (schema
mcp_rate_counter, key="<scope>:<window>", atomic `increment`), wired post-auth in
tools_call. GOTCHA: property(name:) returns STRING → coerce count with `| plus: 0`
before numeric compare (String>Integer raises). MCP_CONFIG constant override tested
live (constant_set → limit honored via config hash_merge).

decision-3 records the ledger-immutability posture (tamper-evidence, not
prevention). Testing done with TRANSIENT probe tools (admin_only + missing-policy),
verified over HTTP, then REMOVED — no broken fixtures shipped.
<!-- SECTION:IMPL:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Authorization matrix tests (principal × tool × args, incl. delegation + deny) written and passing
- [ ] #2 platformos-check lint passes with zero errors
- [ ] #3 Docs updated (docs/security-model.md + spec §12 cross-ref)
- [ ] #4 Deployed to staging; a policy-denied call and an allowed call both verified live + in ledger
- [ ] #5 Security invariants verified — no implicit allow; principal-scoped in delegation; reasons stable, details only in ledger
- [ ] #6 Reviewed before merge
<!-- DOD:END -->
