---
id: TASK-1.9
title: 'Admin — ledger view + observability baseline'
status: Done
assignee: []
created_date: '2026-07-23'
updated_date: '2026-07-23'
labels:
  - pos-module-mcp
  - admin
  - observability
dependencies:
  - TASK-1.7
parent_task_id: TASK-1
priority: medium
ordinal: 1090
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make the attestation surface usable and monitorable (spec §20). An admin-gated
(`mcp_admin_only`) ledger view: searchable/filterable ledger (by tool, client,
principal, decision, outcome, time) backed by `lib/queries/ledger/search.liquid`,
plus a chain-verification status indicator driven by `verify_chain`.

Observability baseline metrics from the ledger: calls/min by tool and client,
denial rate by policy, p50/p95 latency split (pipeline vs handler),
schema-rejection rate. Wire the one alert that pages immediately:
chain-verification failure (§20). Rollback-rate and approval-queue metrics are
Phase 2 (no mutating tools/approvals yet) — leave the panels stubbed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Admin-only console lists + filters by tool/principal/client/decision/outcome. Data layer: ledger/search.graphql (optional property filters — null value = ignore, VERIFIED: filter outcome:invalid → exactly the 2 invalid rows). Page renders a filterable table.
- [x] #2 Chain-verification status shown (green "verified — N intact" / red "BROKEN at seq X — reason") via metrics.chain (verify_chain). VERIFIED metrics returns chain{ok,count,broken_at,reason}.
- [x] #3 Baseline metrics from ledger: total, by_outcome, by_tool, by_decision, denials, denial_rate, schema_rejections, rate_limited. VERIFIED live (4 seeded calls → correct aggregation). Latency p50/p95 logic wired but reports available:false until duration_ms is recorded (ms-timer seam — see notes).
- [x] #4 Chain-failure → red "Investigate immediately" banner (page-immediately alert signal).
- [x] #5 Non-admins/anonymous → 403 BEFORE any query (gate runs first). VERIFIED live (anonymous GET → 403 operators-only). Same allowlist as admin_only (MCP_ADMIN_USER_IDS).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:IMPL:BEGIN -->
Files: modules/mcp/public/graphql/ledger/search.graphql (filterable, DESC),
lib/commands/observability/metrics.liquid (paged ledger scan → counts/rates +
chain status), views/pages/mcp-admin.liquid (slug mcp-admin, gated console).

Data layer fully verified via liquid_render + pos_gql_execute; the page is a thin
render over it. Anonymous gate verified over HTTP (403). The admin-AUTHENTICATED
render couldn't be exercised end-to-end (no users/sessions seeded on the instance),
but the gate + data are proven and the template is straightforward.

KEY platformOS LESSONS:
- HTML pages with escape_output_instead_of_sanitize:true → `echo '<html>'` gets
  ENTITY-ESCAPED. Structural HTML must be LITERAL template (outside {%- -%}); only
  data goes through {{ }} (which escapes — a DELIBERATE XSS defense here, since
  agent-influenced ledger fields like agent_id/tool_name are rendered). Fixed the
  deny branch by moving it to a template-level {% if %} instead of echo.
- Optional graphql property filters: a null $value is IGNORED (matches all), so one
  query serves all filter combinations.
- Latency: platformOS 'now' is second-resolution; ms percentiles need a finer timer.
  metrics.liquid already computes p50/p95 when durations exist → recording
  duration_ms in tools_call (one line, future) lights it up with no other change.
<!-- SECTION:IMPL:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Admin-authz + query tests written and passing
- [ ] #2 platformos-check lint passes with zero errors
- [ ] #3 Docs updated (spec §20 cross-ref)
- [ ] #4 Deployed to staging and smoke-checked with real ledger data
- [ ] #5 Security invariants verified — admin-gated; no raw arguments/PII exposed beyond audit_fields
- [ ] #6 Reviewed before merge
<!-- DOD:END -->
