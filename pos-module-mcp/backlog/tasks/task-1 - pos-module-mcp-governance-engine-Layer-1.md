---
id: TASK-1
title: 'pos-module-mcp — the governance engine (Layer 1)'
status: Done
assignee: []
created_date: '2026-07-23'
updated_date: '2026-07-23'
labels:
  - pos-module-mcp
  - epic
dependencies: []
parent_task_id: ''
priority: high
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Build `pos-module-mcp`: a platformOS module that turns any instance into a
governed Model Context Protocol server. It is **Layer 1** — identical on every
instance, zero business logic: JSON-RPC transport, identity resolution, schema
validation, authorization dispatch, transaction wrapping, a hash-chained
attestation ledger, tool/resource discovery, error mapping. Business meaning
("Layer 2") lives in per-instance app tools that reference their own commands
and named authorization policies. See `modules/mcp/pos-module-mcp-spec.md` for
the full specification (this epic tracks it section-by-section).

**Placement / test strategy:** the module is developed in-repo at `modules/mcp/`
of this `pos-module-community` clone so it can be exercised **standalone against
the community instance** — community supplies real Layer-2 tools and `.md`
pages to test the Layer-1 engine. Test env: `staging`
(`fk-test-ci-instance-04.ps-01-platformos.com`, ps-01).

**Hard non-goals (reject in review — spec §2):** no GraphQL introspection into
tools; no generic `run_graphql`/`execute_liquid` escape-hatch tool under any
config; no model inference/hosting; no agent orchestration or memory. Tools are
curated commands, never auto-generated schema (§4.1).

**Load-bearing primitives are already verified** on ps-01 — see
`backlog/decisions/decision-1`. Key facts every implementer must use:
SHA-256 = `| digest: 'sha256'` (NOT `sha256`/`hmac_sha256`); `transaction`/
`rollback` tags work and continue after `endtransaction`; `jwt_encode`/decode
exist (hash arg); `context.headers.HTTP_AUTHORIZATION` reads the bearer.

**Delivery is phased (spec §21).** Phase 1 (this epic's subtasks) = the governed
**read** server + the full identity + attestation planes. Phases 2–4 are tracked
in task-2 / task-3 / task-4.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Phase 1 subtasks (task-1.1 … task-1.10) are all Done and the Phase-1 success criterion (spec §22) holds: an off-the-shelf MCP client, given only a bearer token + endpoint URL, can list and call an app-declared READ tool
- [ ] #2 Every call — allowed and denied — appears in a verifiable hash-chained ledger; `verify_chain` passes and detects tampering
- [ ] #3 No configuration exists that exposes an unauthorized or unvalidated action (no-implicit-allow enforced; missing authorization_policy = invalid manifest = excluded)
- [ ] #4 The module is inert-but-armed on install (endpoint live, auth wired, ledger table present, tool registry empty) and requires explicit registration to serve any tool (§3.1, §8.2)
- [ ] #5 `.md` page resources work with zero app tool configuration (§3.2)
- [ ] #6 All spec §18 open decisions are closed (recorded in decision-1 + task-1.1) before Phase 1 is called Done
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Automated tests written and passing (protocol conformance / validation / authz / ledger integrity as applicable)
- [ ] #2 platformos-check lint passes with zero errors
- [ ] #3 Docs updated (module docs/ + spec section cross-reference)
- [ ] #4 Deployed to the community test instance (staging) and smoke-checked over real /mcp HTTP
- [ ] #5 Security invariants verified — no-implicit-allow · identity-bound · args passed as typed variables (never string-interpolated) · ledger written on every post-auth termination
- [ ] #6 Change reviewed before merge
<!-- DOD:END -->
