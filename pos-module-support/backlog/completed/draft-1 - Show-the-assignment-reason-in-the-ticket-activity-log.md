---
id: DRAFT-1
title: 'Show the assignment reason in the ticket activity log'
status: Done
assignee: []
created_date: '2026-10-28'
labels:
  - ui
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
E2E scenario A1 (tests/e2e/01-email-flow.spec.ts, test 1b) fails: an auto-assigned ticket's activity log reads "System assigned the ticket" without the reason, although the `assigned` ticket_event stores it (e.g. "least-loaded in E2E: 3 open"). Spec 10 §3 scenario 1 requires the log to name the reason.

Fix: in views/partials/ticket/index.liquid show `event.reason` after the event text for event types whose reason is human-readable (`assigned`, `delivery_failed`).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The activity row of an automatic assignment shows the reason (least-loaded / host rule / escalation)
- [x] #2 Events whose reason field holds ids or counts do not show it
- [x] #3 E2E A1 test 1b passes
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: views/partials/ticket/index.liquid shows the stored reason after `assigned` and `delivery_failed` activity rows.
Outcome: an auto-assigned ticket reads e.g. "System assigned the ticket (least-loaded in E2E: 3 open)". E2E A1 (1b) passes.
Next: None.
<!-- SECTION:FINAL_SUMMARY:END -->
