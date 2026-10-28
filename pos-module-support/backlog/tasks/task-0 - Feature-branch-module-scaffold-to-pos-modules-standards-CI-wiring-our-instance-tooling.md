---
id: TASK-0
title: 'Feature branch, module scaffold to pos-modules standards, CI wiring, our instance, tooling'
status: To Do
assignee: []
created_date: '2026-10-27'
labels:
  - mvp
  - ops
dependencies: []
priority: high
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create feature/pos-module-support from origin/master in Platform-OS/pos-modules; scaffold pos-module-support/ with the full file set of 02 §2 (mirroring pos-module-user); add the module to the root .gitignore, .github/workflows/lint.yml and tests.yml (13 §3); write tests/data/seed/seed.sh (+ --keep-data) and tests/ci-static.sh; upgrade pos-cli to 6.7+, run `pos-cli ai init --tool claude --agent-playbook` locally and exclude .mcp.json; add the support-dev env; create the private org Project "pos-module-support" with one draft item per task.

Spec: tech-spec 00 §2, 02 §2, 13.
Files: pos-module-support/**; root .gitignore; .github/workflows/{lint,tests}.yml
Tests: CI run on the pushed scaffold; deploy-start of the scaffold to support-dev
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Branch pushed; pos-module-support/ contains every file listed in 02 §2 (empty module code allowed)
- [ ] #2 Pushing the branch runs pos-modules lint and tests for pos-module-support and both pass on the scaffold
- [ ] #3 .claude/, .pos and .mcp.json are not tracked by git
- [ ] #4 support-dev env works (`envs-list`); API calls enabled for staging on that instance
- [ ] #5 Private Project has Status/Priority/Iteration and one draft item per task linked to its task file; no issues or PRs created in pos-modules
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
<!-- Done / Outcome / Next -->
<!-- SECTION:FINAL_SUMMARY:END -->
