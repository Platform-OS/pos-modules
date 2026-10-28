---
id: TASK-0
title: 'Feature branch, module scaffold to pos-modules standards, CI wiring, our instance, tooling'
status: Done
assignee:
  - "@arturpawlak"
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
- [x] #1 Branch pushed; pos-module-support/ contains every file listed in 02 §2 (empty module code allowed)
- [x] #2 Pushing the branch runs pos-modules lint and tests for pos-module-support and both pass on the scaffold
- [x] #3 .claude/, .pos and .mcp.json are not tracked by git
- [ ] #4 support-dev env works (`envs-list`); API calls enabled for staging on that instance
- [x] #5 Private Project has Status/Priority/Iteration and one draft item per task linked to its task file; no issues or PRs created in pos-modules
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: Branch feature/pos-module-support from master; pos-module-support scaffold (manifest, lock, platformos-check scope, Playwright config, changelog/PR templates, MIGRATIONS.md, seed.sh with --keep-data, ci-static.sh gate); registered in root .gitignore, lint.yml and tests.yml; backlog copied; Agent Playbook installed locally (pos-cli 6.6.0 is the latest release and has ai init); support-dev connected (empty staging instance) and the scaffold deployed; GitHub Project 28 with 32 draft items.
Outcome: pos-modules CI ran Lint and Tests for pos-module-support on the first push and both passed. pos-module-websocket is not on the marketplace, so live updates use platformOS channels (decision-11).
Next: Artur confirms "API call notifications for staging" is on for support-dev (AC #4, not verifiable from here); TASK-1 spike; then TASK-2.
<!-- SECTION:FINAL_SUMMARY:END -->
