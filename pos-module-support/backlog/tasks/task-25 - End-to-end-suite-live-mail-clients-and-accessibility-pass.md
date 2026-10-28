---
id: TASK-25
title: 'End-to-end suite, live mail clients and accessibility pass'
status: To Do
assignee: []
created_date: '2026-10-27'
labels:
  - mvp
dependencies:
  - TASK-8
  - TASK-10
  - TASK-11
  - TASK-13
  - TASK-14
  - TASK-15
  - TASK-16
  - TASK-17
  - TASK-19
  - TASK-21
  - TASK-29
  - TASK-30
  - TASK-31
priority: high
ordinal: 1250
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Complete the Playwright suite (scenarios 1–16), run the manual mail-client matrix (Gmail, Outlook web/desktop, Apple Mail iOS/macOS), accessibility audit with axe and keyboard pass.

Spec: tech-spec 10 §3.
Files: tests/**
Tests: npm run pw-tests
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All 16 E2E scenarios pass on staging
- [ ] #2 Mail-client matrix recorded in tests/manual/mail-clients.md with results
- [ ] #3 No axe violations of serious/critical level
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
<!-- Done / Outcome / Next -->
<!-- SECTION:FINAL_SUMMARY:END -->
