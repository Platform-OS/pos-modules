---
id: TASK-13
title: 'Least-loaded auto-assignment and escalation'
status: Done
assignee:
  - "@arturpawlak"
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
- [x] #1 All assignment unit tests in 10 §2 pass
- [x] #2 Activity log shows "least-loaded in <dept>: N open"
- [x] #3 With everyone Away, managers alerted at 15 min and on-duty manager assigned at 30
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: Added helpers/team/effective_availability (setting, then working hours in their time zone and holidays), queries/agents/available_in_department (active agents and managers of the department with open counts from one query), commands/assignment/pick (available, under cap, fewest open, then least recently assigned with never-assigned first, then lowest id), auto_assign (host support_assignment alter hook first; reason "least-loaded in <dept>: N open"; with nobody available, escalation jobs at unassigned_alert_minutes (p0: _p0) and escalate_after_minutes), escalate (exits if assigned or closed; alert publishes support_ticket_unassigned; assign_on_duty assigns the on-duty manager, else alerts again), queries/team_members/on_duty, reassign_if_off (assignee not available for more than one business day since their last availability change), consumers on ticket created and message received, and an example host rule (VIP subjects go to a manager). team_members/create keeps a given availability.
Outcome: assignment_test passes on support-dev (pick order and skips, working-hours off, least-loaded agent assigned with the reason in the activity log, host hook overrides, nobody available logs and schedules escalation, alert stage publishes). All 16 test files pass.
Deviations: who receives the unassigned alert is TASK-14 (notifications); availability_changed rows are written by the profile page (TASK-16).
Next: None.
<!-- SECTION:FINAL_SUMMARY:END -->
