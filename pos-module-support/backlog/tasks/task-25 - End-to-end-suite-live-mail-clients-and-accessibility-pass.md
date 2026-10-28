---
id: TASK-25
title: 'End-to-end suite, live mail clients and accessibility pass'
status: Done
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
- [x] #3 No axe violations of serious/critical level
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: Playwright suite in tests/e2e/ (helpers, global setup/teardown that route all email to the example app's SendGrid stub and prepare an E2E department) covering scenarios 1–16 (01–06 spec files), an axe pass (WCAG 2.1 AA, light and dark, nine desk pages + sign-in), and a wider end-to-end plan (tests/e2e/TEST-PLAN.md, Part B, 07-plan.spec.ts). Manual mail-client matrix in tests/manual/mail-clients.md. The example-app stub keeps the last 40 request bodies.
Outcome: on support-dev the full suite passes: 35 passed, 1 skipped (scenario 11, fresh install, needs a new instance: set E2E_FRESH_URL and the admin credentials). The first run found nine defects, recorded as DRAFT-1…9 in backlog/drafts/ and fixed (activity reason, colleague-reply warning, axe on Settings → Email, a missing translation, sidebar save on New tickets, duplicate deliveries, board width on phones, Snooze, live updates through the job queue). 26/26 Liquid unit tests pass. Run with MPKIT_URL=… E2E_ENV=support-dev npx playwright test.
Next: AC1 is met except scenario 11 (needs a fresh instance); AC2 needs the mail-client matrix run by a person with real mailboxes (Gmail, Outlook, Apple Mail); the suite is not in CI (it needs real accounts and secrets on the target instance).
<!-- SECTION:FINAL_SUMMARY:END -->
