---
id: TASK-44
title: 'Side navigation: Views, Departments with counts, Settings at the bottom'
status: Done
assignee: []
created_date: '2026-10-29'
labels:
  - ui
  - iteration-2
dependencies: []
priority: high
ordinal: 1440
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Requested by the product owner on 2026-10-29.
- Two groups in the rail: Views (as before) and Departments: "All departments" first and default, then every department the member serves, each with the number of tickets in the current view and filters.
- Choosing a department filters the queue (list or board) and keeps the view and other filters; choosing a view keeps the department.
- Remove the Workspace group and its Board link; Settings moves to the bottom of the rail, above the signed-in person.
- Remove the department filter from the queue and board filter bars.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Rail shows Views and Departments; All departments is the default and shows the total
- [x] #2 Department counts follow the current view and filters
- [x] #3 Settings sits at the bottom; no Board item; no department select above the queue
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: Rail rewritten in partials/shell with a Departments group (queries/tickets/department_counts: one count per department for the current view and filters, plus All departments); department links keep view and filters, view links keep the department; Workspace group and Board link removed; Settings at the bottom; department select removed from the filter bar.
Outcome: Agents switch department from the rail and see how many tickets each has in the view they are in. Verified on support-dev: 26/26 Liquid unit tests (296 assertions) pass; platformos-check and ci-static clean.
Next: None.
<!-- SECTION:FINAL_SUMMARY:END -->
