---
id: TASK-21
title: 'Acknowledgement, Confirmation emails and Confirmation mode'
status: Done
assignee:
  - "@arturpawlak"
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
- [x] #1 One acknowledgement per ticket, none to auto-replies
- [x] #2 Auto-close mode: email states the close period; ticket closes when it ends
- [x] #3 Keep-open mode: email asks for confirmation without a deadline; assignee gets exactly one push and email when the period ends
- [x] #4 Admins switch the mode in Settings → Statuses; default is auto-close, 7 days
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: Added messages/send_system (automatic customer email stored as a public system message, shown in the thread as "Automatic email", delivered with Auto-Submitted, never counted as an agent reply), messages/acknowledge with queries/messages/acknowledgement_decision (no acknowledgement for agent-created, closed/spam, auto-reply or inactive-department tickets, nor to a sender acknowledged in the last 24 h; states the first-reply target), messages/confirm_solution (wording follows confirmation_mode: auto_close names the period, keep_open has no deadline), consumers send_acknowledgement (ticket created) and send_confirmation (status moved into a solved category), the email templates, and the Confirmation form on Settings → Statuses (auto_close default, 1-28 days, 7 by default). Delivery now refuses ticket mail until Settings → Email is turned on (EM-0c), marking it failed with email_not_enabled. Closing at the end of the period and the single keep_open reminder come from the TASK-12 sweep (tested there).
Outcome: customer_emails_test passes; all 22 test files pass. Live on support-dev (email turned on): an emailed request from the artur+sd-customer alias got the acknowledgement (sent), and moving it to Confirmation sent the confirmation email (sent).
Next: None.
<!-- SECTION:FINAL_SUMMARY:END -->
