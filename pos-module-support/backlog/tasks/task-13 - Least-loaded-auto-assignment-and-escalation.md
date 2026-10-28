---
id: TASK-13
title: 'Least-loaded auto-assignment and escalation'
status: To Do
assignee: []
created_date: '2026-10-27'
labels:
  - mvp
dependencies:
  - TASK-9
  - TASK-12
priority: high
ordinal: 1130
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
team_member availability with working hours, agents/available_in_department query, assignment/auto_assign with alter hook, escalate jobs (alert at 15/5 min, on-duty at 30), reassignment when assignee Off > 1 business day.

Spec: tech-spec 06 §1, 06 §2.
Files: public/lib/commands/assignment/**; public/lib/queries/agents/available_in_department.liquid; public/lib/consumers/support_ticket_created/assign_new_ticket.liquid
Tests: unit + E2E scenario 1
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All assignment unit tests in 10 §2 pass
- [ ] #2 Activity log shows "least-loaded in <dept>: N open"
- [ ] #3 With everyone Away, managers alerted at 15 min and on-duty manager assigned at 30
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
<!-- Done / Outcome / Next -->
<!-- SECTION:FINAL_SUMMARY:END -->
