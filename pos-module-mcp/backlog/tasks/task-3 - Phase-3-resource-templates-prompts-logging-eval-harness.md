---
id: TASK-3
title: 'Phase 3 — resource templates, prompts, logging, richer admin, eval harness'
status: Done
assignee: []
created_date: '2026-07-23'
updated_date: '2026-07-23'
labels:
  - pos-module-mcp
  - phase-3
dependencies:
  - TASK-2
parent_task_id: ''
priority: low
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Broaden the protocol surface and add quality gates (spec §13.1, §19.3, §21).
Break into subtasks when picked up:
- `resources/templates/list`, `prompts/list`, `prompts/get`,
  `logging/setLevel` (§13.1 Phase-3 rows).
- Richer admin: full tool registry view (versions + policies), client
  management, pending-approvals queue.
- **Eval harness (§19.3):** golden agent transcripts stored as Records; eval
  runs as background jobs; results queryable via GraphQL; CI gates on
  regression. Measures whether tool DESCRIPTIONS produce correct tool selection
  — a dimension unit tests can't reach and one that degrades silently as the
  tool set grows.
- Dev-time scaffolder groundwork (§8.4): `pos-cli mcp scaffold-tool` emitting a
  DRAFT manifest + handler stub (authorization_policy unset → fails meta-schema
  → excluded until a human constrains it). Propose-then-validate; never reaches
  an agent unreviewed. (This is the legitimate home for the "AI code generator"
  ask WITHOUT reopening auto-exposure.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 resources/templates/list, prompts/list, prompts/get, logging/setLevel implemented per pinned protocol revision
- [ ] #2 Richer admin: registry (versions+policies), client management, approvals queue
- [ ] #3 Eval harness runs golden transcripts as background jobs, stores results as Records queryable via GraphQL, gates CI on regression
- [ ] #4 pos-cli mcp scaffold-tool emits a DRAFT manifest+stub that is excluded from the registry until authorization_policy + constraints are set by a human
- [ ] #5 New methods covered by conformance fixtures
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Tests written and passing (new-method conformance + eval-harness regression gate)
- [ ] #2 platformos-check lint passes with zero errors
- [ ] #3 Docs updated (docs/authoring-tools.md scaffolder + spec §8.4/§19.3 cross-ref)
- [ ] #4 Deployed to staging and smoke-checked
- [ ] #5 Security invariants verified — scaffolder output never agent-reachable unreviewed
- [ ] #6 Reviewed before merge
<!-- DOD:END -->
