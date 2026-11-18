---
id: TASK-49
title: Install generator writes the MCP app shim
status: To Do
assignee: []
created_date: '2026-11-18 16:58'
labels:
  - ops
dependencies:
  - TASK-48
documentation:
  - docs/mcp-implementation-notes.md
priority: medium
ordinal: 3470
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pos-module-mcp resolves its registry, authorization policies and connection instructions from fixed app paths (app/lib/mcp/registry.liquid, app/lib/mcp/policies/<name>.liquid, app/lib/mcp/instructions.liquid), so a module cannot register its own tools. Every desk that wants the MCP tools has to add three delegating files by hand today.

Add an optional step to modules/support/generators/install that writes them, in the same style as the branding and headscripts hooks it already writes: offer the step only when pos-module-mcp is installed, skip any file that already exists, and append the support entries to an existing app registry rather than overwriting it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Running the install generator on a desk with pos-module-mcp installed offers to write the shim
- [ ] #2 An app that already has app/lib/mcp/registry.liquid keeps its own tools and gains the support ones
- [ ] #3 Running the generator twice changes nothing
- [ ] #4 The step is skipped, with a one-line explanation, when pos-module-mcp is not installed
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Acceptance criteria met and checked
- [ ] #2 Every changed Liquid/GraphQL/YAML file passed validate_code before it was written; check-run reports zero errors
- [ ] #3 Tests written and passing; each fails when its behaviour is removed
- [ ] #4 Deployed to staging with deploy-start (never pos-cli deploy) and smoke-checked via URL + logs-fetch
- [ ] #5 Security invariants hold: permission check, department scope, CSRF on POST, ownership load before by-id writes, no secrets or bodies in logs
- [ ] #6 All user-visible strings in translations/en.yml; no translation missing
- [ ] #7 Accessible: keyboard, focus, 4.5:1 contrast on default and example host theme, status not by colour alone
- [ ] #8 README / CLAUDE.md / SKILL.md updated when behaviour, hooks, settings or constants change
- [ ] #9 Final summary written as Done / Outcome / Next
<!-- DOD:END -->
