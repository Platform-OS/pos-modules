---
id: TASK-47
title: 'Routing, alerts and pickers read every active team member'
status: Done
assignee: []
created_date: '2026-10-29'
labels:
  - ui
  - iteration-2
dependencies: []
priority: medium
ordinal: 1470
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
queries/notifications/recipients, queries/agents/available_in_department and queries/team_members/on_duty read one page of 200 active members (active.liquid 100), so on a desk with more members the newest ones would get no alerts and no tickets.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Recipients, auto-assignment, on-duty manager and pickers see every active member
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: queries/team_members/all_active reads every active member 200 at a time; recipients, available_in_department, on_duty and active (profiles 100 at a time) use it.
Outcome: No cap on desk size; assignee pickers list each member once and add the email when two people share a name; notifications_test disables its member when done (27 leftover test members disabled on support-dev). Found while chasing a notifications_test failure in a full unit run; with 128 members on support-dev the cap was not proven to be its cause; the test passes alone and in the next full run. Verified on support-dev: 26/26 Liquid unit tests (296 assertions) pass; platformos-check and ci-static clean.
Next: None.
<!-- SECTION:FINAL_SUMMARY:END -->
