---
id: TASK-3.2
title: 'Eval harness — tool-surface + golden-case regression (§19.3)'
status: Done
assignee: []
created_date: '2026-07-23'
updated_date: '2026-07-23'
labels:
  - pos-module-mcp
  - phase-3
  - eval
dependencies:
  - TASK-1.4
parent_task_id: TASK-3
priority: medium
ordinal: 3200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The eval harness (spec §19.3) — measures whether the tool surface holds up as it
grows, the quality dimension that degrades tool selection silently and that unit
tests cannot reach. Golden cases are stored as records; a run executes deterministic
checks, stores a result record (queryable), and CI gates on regression. The module
does NOT call LLMs (spec §2), so the model-driven "did the descriptions actually
lead the model to the expected tool" step lives in the external runner as a
documented hook.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Golden cases stored as records (mcp_eval_case: prompt, expected_tool, expected_args_json). Queryable/extendable without deploy.
- [x] #2 Deterministic checks: surface/desc_present, surface/no_poison (tool-poisoning lint), surface/desc_unique, golden/case_tool_exists, golden/case_args_valid. VERIFIED live (16/16 on the current surface).
- [x] #3 Each run stores an mcp_eval_run record (run_id, total/passed/failed, failures_json) — results queryable via GraphQL. Background-job-capable (synchronous now).
- [x] #4 Catches real regressions, not always-green: VERIFIED — stale expected_tool → case_tool_exists fails; malformed golden args → case_args_valid fails (with the exact schema errors).
- [x] #5 Operator can run it from /mcp-admin (Run eval button + latest-run card showing pass/fail + failures). VERIFIED live.
- [x] #6 CI runner (modules/mcp/tests/eval.mjs) triggers the run, reads the result, and EXITS NON-ZERO on failure. VERIFIED: exit 0 clean, exit 1 with an injected regression (prints the failing check). LLM-selection hook documented (module doesn't call LLMs, §2).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:IMPL:BEGIN -->
Files: schema/mcp_eval_case.yml, schema/mcp_eval_run.yml; graphql/eval/{cases_list,
run_create,runs_latest}; lib/commands/eval/run.liquid (the deterministic runner);
views/pages/mcp-admin/eval.liquid (operator POST trigger) + eval card in mcp-admin;
tests/eval.mjs (CI runner, cookie-jar operator login → trigger → GraphQL read → gate).

KEY DESIGN (spec §2 — module never calls LLMs): the in-platform eval is DETERMINISTIC
(surface quality + golden-call well-formedness) — the failure modes that silently
degrade selection (missing/duplicate/poisoned descriptions, stale golden cases,
malformed golden calls). The LLM-driven selection eval (send prompt + tools/list to a
model, compare its pick to expected_tool) is the EXTERNAL runner's job — left as an
explicit keyed hook (LLM_SELECTION_HOOK) so the CI runner has no network/LLM dependency
by default. Results-as-records + CI gate deliver the §19.3 value today; the LLM layer
plugs in without module changes.
<!-- SECTION:IMPL:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Eval runs, stores records, catches regressions — verified live
- [x] #2 platformos-check passes (deploy succeeded)
- [x] #3 CI runner gates (exit non-zero on fail) — verified
- [x] #4 Operator trigger + admin card verified
- [x] #5 LLM-selection extension documented (no module LLM calls)
<!-- DOD:END -->
