---
id: DRAFT-8
title: 'Add Snooze to the ticket page'
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
E2E case B15 fails: the ticket page has no snooze control, although tickets/snooze exists, apply_form handles change=snooze and spec 02 lists snooze among the ticket update fields; snoozed tickets are un-snoozed by the sweep.

Fix: a Snooze form in the ticket sidebar with presets (1 hour, 1 day, 1 week, computed on the server as UTC times, so no time-zone input) and Unsnooze when a ticket is snoozed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The ticket page offers Snooze for 1 hour / 1 day / 1 week and shows "Snoozed until …" with Unsnooze
- [x] #2 The activity log records the snooze
- [x] #3 E2E B15 passes
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: Snooze form in the ticket sidebar (1 hour / 1 day / 1 week, UTC times computed on the server; Unsnooze when snoozed) with translations.
Outcome: E2E B15 snoozes, shows "Snoozed until …", logs "snoozed the ticket" and unsnoozes.
Next: None.
<!-- SECTION:FINAL_SUMMARY:END -->
