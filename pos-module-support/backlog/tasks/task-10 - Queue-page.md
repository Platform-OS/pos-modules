---
id: TASK-10
title: 'Queue page'
status: To Do
assignee: []
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
- [ ] #1 Views and counts match the data for each role
- [ ] #2 Bulk assign/status/priority applies to all selected and writes events
- [ ] #3 Search by #number, subject, email, organization
- [ ] #4 Works at 375 px
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
<!-- Done / Outcome / Next -->
<!-- SECTION:FINAL_SUMMARY:END -->
