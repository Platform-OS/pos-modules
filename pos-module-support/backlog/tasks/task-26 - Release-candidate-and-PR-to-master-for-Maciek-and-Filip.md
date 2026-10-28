---
id: TASK-26
title: 'Release candidate and PR to master for Maciek and Filip'
status: To Do
assignee: []
created_date: '2026-10-27'
labels:
  - security
  - mvp
dependencies:
  - TASK-25
  - TASK-24
priority: high
ordinal: 1260
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Security review against 09 §2 (optionally with the Cloudflare security-audit skill after reading it); Artur signs off on support-dev; version 0.1.0 in both pos-module.json files, CHANGELOG from changelog-template.hbs, MIGRATIONS.md; open the PR feature/pos-module-support → master with pull_request_template.md, spec link, test evidence and the support-dev URL; request Maciek and Filip.

Spec: tech-spec 09 §2, 13 §5.
Files: pos-module-support/{CHANGELOG.md, MIGRATIONS.md, pos-module.json, modules/support/pos-module.json}
Tests: pos-modules CI green on the PR
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Review notes in the task with each finding resolved or accepted
- [ ] #2 Artur signed off on support-dev
- [ ] #3 PR open with green CI and complete template
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
<!-- Done / Outcome / Next -->
<!-- SECTION:FINAL_SUMMARY:END -->
