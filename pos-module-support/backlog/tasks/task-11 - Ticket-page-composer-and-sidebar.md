---
id: TASK-11
title: 'Ticket page, composer and sidebar'
status: To Do
assignee: []
created_date: '2026-10-27'
labels:
  - mvp
  - ui
dependencies:
  - TASK-9
  - TASK-6
  - TASK-2
priority: high
ordinal: 1110
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Thread (customer, agent, note, system), sandboxed HTML rendering, composer with Reply/Note, saved replies, CC chips, attachments, then-status; sidebar details, SLA, requester, other tickets, engineering link by URL, activity.

Spec: tech-spec 05 §3.
Files: public/views/pages/support-desk/tickets/{show,messages/create,update}.liquid; public/views/partials/support/ticket/**
Tests: E2E scenarios 2 and 4
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Reply sends through TASK-6 and appears as sent; note never in customer email
- [ ] #2 Saved reply variables render from the whitelist only
- [ ] #3 Linking a GitHub issue URL sets Waiting on deploy
- [ ] #4 Customer HTML cannot run script (sandboxed iframe)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
<!-- Done / Outcome / Next -->
<!-- SECTION:FINAL_SUMMARY:END -->
