---
id: TASK-21
title: 'Acknowledgement, Confirmation emails and Confirmation mode'
status: To Do
assignee: []
created_date: '2026-10-27'
labels:
  - mvp
  - email
dependencies:
  - TASK-6
  - TASK-12
  - TASK-14
priority: high
ordinal: 1210
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Acknowledgement consumer with 24 h per-sender limit and auto-reply skip; Confirmation email whose wording follows confirmation_mode; auto-close or one confirm_wait notification via the sweep; the Confirmation setting on Settings → Statuses (auto-close default, keep-open, waiting period 1–28).

Spec: tech-spec 04 §5, 06 §4, 07 §1, PRD NT-1, NT-3, NT-12, TK-3.
Files: public/lib/consumers/support_ticket_created/send_acknowledgement.liquid; public/views/partials/support/emails/*
Tests: unit + E2E scenario 7
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One acknowledgement per ticket, none to auto-replies
- [ ] #2 Auto-close mode: email states the close period; ticket closes when it ends
- [ ] #3 Keep-open mode: email asks for confirmation without a deadline; assignee gets exactly one push and email when the period ends
- [ ] #4 Admins switch the mode in Settings → Statuses; default is auto-close, 7 days
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
<!-- Done / Outcome / Next -->
<!-- SECTION:FINAL_SUMMARY:END -->
