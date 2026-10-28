---
id: TASK-16
title: 'Profile page: availability, devices, notification matrix'
status: Done
assignee:
  - "@arturpawlak"
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
- [x] #1 Every switch saves immediately and reverts on failure
- [x] #2 Pause until tomorrow 09:00 in the agent working-hours zone
- [x] #3 Admin cannot switch alerts off for someone else; can reset to defaults
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: Added the profile page (support-desk/profile): availability (Available/Away/Off with the effective value), Pause all (1 hour, tomorrow 09:00 in the member's working-hours zone or the default policy zone, until turned on; resume), This device (push module toggle and subscription list, Install Support app, iOS hint, test notification), the notification matrix (one real form per switch; pos-support-profile.js saves in place and flips back on failure) and Turn everything on. Commands team_members/update_own (self only; an admin may only reset someone else's to defaults; availability changes logged as availability_changed) and pause_until. Admin view support-desk/settings/agents/:profile_id (read-only matrix + Reset to defaults). Rail link "My profile".
Outcome: profile_test passes (tomorrow 09:00 in Chicago from 22:30, fallback zone, one hour; self switch stored; admin refused switching off, allowed to reset; availability change logged). In Chromium the "Ticket assigned to me – push" switch saved and stayed off after reload, then was turned back on. All 18 test files pass.
Next: None.
<!-- SECTION:FINAL_SUMMARY:END -->
