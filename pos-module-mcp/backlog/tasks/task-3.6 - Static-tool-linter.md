---
id: TASK-3.6
title: 'Static tool linter — enforce author-responsibility security/quality'
status: Done
assignee: []
created_date: '2026-07-23'
updated_date: '2026-07-23'
labels:
  - pos-module-mcp
  - phase-3
  - security
  - tooling
parent_task_id: TASK-3
priority: high
ordinal: 3600
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A wise static linter that reads authored tools (manifest + handler + query) and
flags the security/quality issues the runtime meta-schema cannot see (it never has
the handler source). Turns the "Security boundaries" doc into an automated CI gate.
Must be genuinely clever: understand field semantics (no false "date field can carry
XSS"), catch the dangerous classes (injection, SSRF, ledger-write, ReDoS), and not
cry wolf on correct tools.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Self-contained Node CLI (no deps, no instance): modules/mcp/tests/lint-tools.mjs. `--strict` (warns fail) + `--json`. Exit 1 on failing findings, 0 clean, 2 setup error.
- [x] #2 Lints EVERY tool dir incl. unregistered drafts (scaffolder output). Strips Liquid comments/#-lines first so it lints code, not doc-comments.
- [x] #3 Catches injection/RCE: dynamic GraphQL/function/include/render path from arguments; Liquid interpolation inside .graphql; string-built-from-args near graphql. VERIFIED (probe → dynamic-graphql, dynamic-partial errors).
- [x] #4 Catches SSRF (api_call w/ arguments), ledger-write from handler, records_delete_all, record_delete w/o table. VERIFIED.
- [x] #5 Schema correctness: unsupported keyword, invalid type, invalid/ReDoS pattern, minLength>maxLength, enum-type mismatch, required→undeclared-prop, additionalProperties:true. VERIFIED (all fired on probe).
- [x] #6 CLEVER per-field-kind content hardening: classifies string fields (datetime/email/url/id/slug/display/keyword) → tailored advice (date→format:date-time, display→pattern ^[^<>]*$ for XSS, url→javascript:/SSRF warning, id→strict pattern). No bogus XSS warning on dates. VERIFIED.
- [x] #7 Governance/audit: empty policy (no implicit allow), missing policy file, mutating-mislabel (mutates but mutating:false → no transaction), audit_fields PII/unknown, permissive-mutating-no-approval nudge, tool-poisoning in description. VERIFIED.
- [x] #8 Not noisy: the 3 real tools → only field-kind INFOs; `--strict` exit 0. Vulnerable probe → 16 err + 16 warn, exit 1.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:IMPL:BEGIN -->
modules/mcp/tests/lint-tools.mjs (~430 lines, built-ins only). Parses the
conventional manifest Liquid (hash_assign scalars + the '{json}' | parse_json
input_schema literal) into a plain object; regex-scans comment-stripped handler +
.graphql source. Severity model: error (real vuln / invalid) fails; warn (likely
bug) fails only in --strict; info (context nudge). Field classifier classifyString()
routes the "unconstrained string" advice by name/format — THE cleverness that stops
false XSS warnings on datetimes. Cross-file: handler graphql refs → existence check +
mutation-vs-manifest.mutating consistency; command-wrap detection suppresses the
raw-write nudge. Verified with a deliberately-vulnerable fixture (every planted class
caught) then removed. Documented in README + docs/authoring-tools.md (new "Lint your
tools" section). Sits alongside conformance.mjs + eval.mjs as the 3rd CI gate.
<!-- SECTION:IMPL:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Catches all planted vuln classes (verified via fixture); clean on real tools
- [x] #2 node --check passes; exit codes correct (1 fail / 0 clean)
- [x] #3 Documented (README + authoring guide); CI-gateable
- [x] #4 No false positives on the shipped tools (--strict exit 0)
<!-- DOD:END -->
