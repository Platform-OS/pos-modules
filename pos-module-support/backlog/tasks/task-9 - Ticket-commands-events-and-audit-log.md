---
id: TASK-9
title: 'Ticket commands, events and audit log'
status: Done
assignee:
  - "@arturpawlak"
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
- [x] #1 Category rules on customer reply hold (pending→progress, solved→progress, closed→follow-up)
- [x] #2 Moving to New refused
- [x] #3 Merge moves messages and is undoable for 30 days
- [x] #4 Every change writes a ticket_event and publishes its event
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: Added tickets/create, change_status, assign, set_priority, update_fields, snooze, merge, unmerge, apply_customer_reply and save; messages/create_reply (queues delivery in the background), create_note and move; ticket_events/log; queries/tickets/find (department scope for agents), queries/statuses/all (per-request memo); helpers/props (hash to GraphQL property list by value type); eleven event validators under lib/events; generic records create/update GraphQL and messages/move_all (records_update_all) for merges.
Outcome: ticket_commands_test passes on support-dev: New on create with an audit row, moving to New refused, pending and solved tickets return to In progress on a customer reply, auto-replies change nothing, five status changes give five audit rows, bad priority refused, agents cannot assign others, tags normalised, merge moves messages and closes the source with merged_into_id, unmerge moves them back, notes are internal and blank notes refused. No event validation errors in the logs.
Next: None.
<!-- SECTION:FINAL_SUMMARY:END -->
