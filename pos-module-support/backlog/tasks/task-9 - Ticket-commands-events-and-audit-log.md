---
id: TASK-9
title: 'Ticket commands, events and audit log'
status: To Do
assignee: []
created_date: '2026-10-27'
labels:
  - mvp
dependencies:
  - TASK-3
priority: high
ordinal: 1090
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
change_status, assign (manual), set_priority, update_fields, snooze, merge/unmerge, messages/create_reply, create_note, move; events with validators; ticket_event writes; scoped loads before writes.

Spec: tech-spec 05 §1.
Files: public/lib/commands/{tickets,messages}/**; public/lib/events/support_*.liquid
Tests: unit per command
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Category rules on customer reply hold (pending→progress, solved→progress, closed→follow-up)
- [ ] #2 Moving to New refused
- [ ] #3 Merge moves messages and is undoable for 30 days
- [ ] #4 Every change writes a ticket_event and publishes its event
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
<!-- Done / Outcome / Next -->
<!-- SECTION:FINAL_SUMMARY:END -->
