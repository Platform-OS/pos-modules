---
id: TASK-16
title: 'Profile page: availability, devices, notification matrix'
status: To Do
assignee: []
created_date: '2026-10-27'
labels:
  - mvp
  - ui
  - pwa
dependencies:
  - TASK-14
  - TASK-15
priority: high
ordinal: 1160
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Profile page with availability switch, device card (push module partials, test notification), switch matrix saving per change, Pause all with until, Turn everything on; admin read-only view with reset.

Spec: tech-spec 07 §3.
Files: public/views/pages/support-desk/profile/**; public/views/partials/support/profile/**
Tests: E2E scenario 8; unit for pause time calculation
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every switch saves immediately and reverts on failure
- [ ] #2 Pause until tomorrow 09:00 in the agent working-hours zone
- [ ] #3 Admin cannot switch alerts off for someone else; can reset to defaults
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
<!-- Done / Outcome / Next -->
<!-- SECTION:FINAL_SUMMARY:END -->
