---
id: TASK-8
title: 'Threading, ticket and message creation from email, attachments'
status: To Do
assignee: []
created_date: '2026-10-27'
labels:
  - mvp
  - email
dependencies:
  - TASK-5
  - TASK-7
  - TASK-9
priority: high
ordinal: 1080
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
match_ticket cascade, tickets/create from email, messages/create_inbound, attachments via presigned upload, cid rewrite, follow-up on closed tickets.

Spec: tech-spec 04 §2.3, 04 §3.
Files: public/lib/commands/inbound/match_ticket.liquid; public/lib/commands/{tickets/create,messages/create_inbound,attachments/store}/**
Tests: unit + E2E scenario 1 and 3
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every threading unit test in 10 §2 passes
- [ ] #2 Attachments stored privately and downloadable only by permitted agents
- [ ] #3 Inline images render in the thread
- [ ] #4 match_reason recorded on every message
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
<!-- Done / Outcome / Next -->
<!-- SECTION:FINAL_SUMMARY:END -->
