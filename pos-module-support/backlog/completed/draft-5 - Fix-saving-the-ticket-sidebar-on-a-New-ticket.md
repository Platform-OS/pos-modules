---
id: DRAFT-5
title: 'Fix saving the ticket sidebar on a New ticket'
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
E2E case B12 fails: on a ticket in New, changing priority or tags in the sidebar and pressing Save changes nothing. commands/tickets/apply_form compares `params.status_key` with `ticket.status_key`, a field tickets do not have, so it always calls change_status with the unchanged key; for New that is refused ("can't be moved back to New") and the rest of the form is never applied. On other statuses it writes a needless status_changed check.

Fix: compare with the key of the ticket's current status (statuses.by_id[ticket.status_id].key).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Saving the sidebar on a New ticket saves priority, assignee, department and tags without an error
- [x] #2 An unchanged status writes no status change
- [x] #3 E2E B12 passes
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: commands/tickets/apply_form compares with the key of the ticket's current status.
Outcome: the sidebar saves priority, assignee, department and tags on New tickets (E2E B12 passes).
Next: None.
<!-- SECTION:FINAL_SUMMARY:END -->
