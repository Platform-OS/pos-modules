---
id: TASK-10
title: 'Queue page'
status: Done
assignee:
  - "@arturpawlak"
created_date: '2026-10-27'
labels:
  - mvp
  - ui
dependencies:
  - TASK-9
  - TASK-2
priority: high
ordinal: 1100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tickets/search and tickets/counts queries; queue page with rail views, attention strip, priority filter, group by status/priority, rows, bulk bar, search, empty state; department scope; keyboard shortcuts.

Spec: tech-spec 05 §2, 05 §3.
Files: public/views/pages/support-desk/index.liquid; public/views/partials/support/queue/*; public/lib/queries/tickets/{search,counts}.liquid; public/assets/js/pos-support-queue.js
Tests: E2E: views, bulk, search; axe accessibility check
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Views and counts match the data for each role
- [x] #2 Bulk assign/status/priority applies to all selected and writes events
- [x] #3 Search by #number, subject, email, organization
- [x] #4 Works at 375 px
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: Added queries/tickets/scope (agents: own departments; managers/admins: all), queries/tickets/search (views mine, needs_reply, unassigned, all_open, waiting, awaiting_confirmation, sla_at_risk, deploy, closed; filters department, priority, status, organization; #number or text search; related contacts, organizations, profiles, departments and statuses loaded with one query per table), queries/tickets/counts (one GraphQL call with aliases), queries/team_members/active, the queue page with rail views and counts, attention strip, filter toolbar, bulk form (assignee/status/priority through the same commands, so rules and events apply) at support-desk/tickets/bulk, pagination, status and priority badges on the fixed semantic tokens (light and dark), the keyboard script (j/k/x and /), and a last-running test that deletes fixture tickets.
Outcome: queue_test passes on support-dev (agent sees only own department and cannot filter into another, #number and email search, counts, bulk assign/priority/status writes four events, agent bulk-assigning others fails). Screenshots at 1280 and 375 px show the list; the page has no horizontal overflow at 375 px (table scrolls inside its box, rail becomes a scrolling top menu).
Deviations: default sort is priority then newest; sorting by SLA due time comes with the SLA engine (TASK-12). Snoozed tickets are not hidden yet (TASK-11 snooze UI). Automated axe check is part of TASK-25.
Next: None.
<!-- SECTION:FINAL_SUMMARY:END -->
