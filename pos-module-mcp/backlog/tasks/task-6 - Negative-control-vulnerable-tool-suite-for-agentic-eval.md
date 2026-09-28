---
id: TASK-6
title: 'Negative-control vulnerable tool suite for agentic-eval (prove the eval catches real FAILs)'
status: Done
assignee: []
created_date: '2026-07-25'
labels:
  - pos-module-mcp
  - agentic-eval
  - security
dependencies: []
priority: high
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every current `test_*` tool is CORRECTLY governed, so the agentic-eval pentester finds
0 FAILED — which proves the module is sound but does NOT prove the eval has teeth (that
its graders + agent actually detect a real vulnerability rather than always reporting
HELD). Add a **negative-control** suite: deliberately INSECURE tools, each breaking one
governance control, gated behind a NEW constant `MCP_ENABLE_VULN_TOOLS` (separate from
`MCP_ENABLE_TEST_TOOLS`). Never enabled in production — a plain deploy (constant unset)
never registers them.

The tools (app-owned, under `app/views/partials/mcp/tools/vuln_*`), each a real,
demonstrable exploit mapped to a CIAP plane + the control it bypasses:

1. **`vuln_privesc`** (Privacy/authz) — an admin-effect action wired to a MEMBER
   authorization policy, so a `role=user` principal executes an admin-only action.
   Breaks: named-policy authorization.
2. **`vuln_idor`** (Privacy) — accepts a `user_id` argument and returns THAT user's
   `test_note` rows with no ownership check. Breaks: tenancy / object-level authz.
3. **`vuln_xss`** (Integrity) — a write tool whose `label` schema OMITS the `^[^<>]*$`
   pattern, storing raw `<script>`/`<img onerror>` markup that renders in the operator
   console. Breaks: input validation / output encoding.
4. **`vuln_secret`** (Confidentiality) — returns internal state (a config dump / a token
   digest) in the tool result. Breaks: least-leakage.
5. **`vuln_unattested`** (Integrity) — a mutating tool that writes its row but is declared
   `mutating:false` / skips the transaction, so the mutation is NOT attested in the
   ledger. Breaks: attestation completeness.
6. **`vuln_graphql_inject`** (Integrity, if feasible) — interpolates an argument into an
   inline `{% graphql %}` block instead of a typed variable. Breaks: argument isolation.

Eval integration — a `negative-control` task/mode (`tasks.mjs`) that runs with
`MCP_ENABLE_VULN_TOOLS=1` and **INVERTS** the verdict: it asserts the run reports FAILED
(the agent + graders MUST catch each planted vuln). A HELD there is itself an eval defect.
Concretely: extend the graders with targeted probes (e.g. `vuln_ssti` returns `49`;
`vuln_privesc` succeeds as a user; `vuln_idor` returns another principal's row;
`vuln_unattested` mutates with no ledger entry) and expect them to trip.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `vuln_*` tools live under `app/views/partials/mcp/tools/`, registered ONLY when `MCP_ENABLE_VULN_TOOLS` is `1`/`true`; a plain deploy never serves them
- [x] #2 Each vuln tool is genuinely exploitable and maps to one CIAP plane + the control it breaks
- [x] #3 A `negative-control` eval mode (`run.mjs --vuln`) enables the flag, runs, and INVERTS the verdict (detect ≥1 planted vuln ⇒ `NEG-CONTROL PASS`; all-clear ⇒ `NEG-CONTROL FAIL`); flag auto-restored
- [x] #4 Graders gain targeted probes (`probePlantedVulns`) that detect each vuln's concrete impact (privesc / IDOR / stored-XSS / secret leak) with a fresh minted token
- [x] #5 Documented in agentic-eval/README (negative-control section) + the registry comment; CHANGELOG entry
- [x] #6 The positive suite (secure `test_*` tools, flag unset) still reports HELD — the two modes are independent
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `run.mjs --vuln` on the live instance: `NEG-CONTROL PASS — detected 4/4 planted vulns`, flag auto-restored
- [x] #2 Running without the flag still yields HELD (defenses intact) — negative and positive controls both pass
- [x] #3 No vuln tool is reachable on a production (flag-unset) deploy — verified via `tools/list` (served: NONE)
- [x] #4 `node --check` clean; documented (README + CHANGELOG + registry comment)
<!-- DOD:END -->
