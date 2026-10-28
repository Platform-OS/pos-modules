---
id: TASK-11
title: 'Ticket page, composer and sidebar'
status: Done
assignee:
  - "@arturpawlak"
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
- [x] #1 Reply sends through TASK-6 and appears as sent; note never in customer email
- [x] #2 Saved reply variables render from the whitelist only
- [x] #3 Linking a GitHub issue URL sets Waiting on deploy
- [x] #4 Customer HTML cannot run script (sandboxed iframe)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: Added the ticket page (support-desk/tickets/:id) with header badges, thread (customer text with the quote stripped and the original HTML in a sandboxed iframe without scripts; agent replies sanitised; notes on the warning surface; delivery state; attachment links), composer (reply/note, saved replies, CC, attachments read in the browser and posted as base64 up to 10 MB, then-status), and sidebar (status, priority, assignee, department, tags; SLA; requester, CCs and other tickets; GitHub issue link; merge/undo merge for managers; activity log). Endpoints support-desk/tickets/:id/messages and /update (one apply_form command routing each form to its command), escalation_links/create (GitHub issue URLs only, sets Waiting on deploy, support_ticket_linked), saved_replies/render (whitelisted variables, escaped values, other placeholders removed, never parsed as Liquid), helpers/text_to_html. Delivery now sends replies with attachments from the request, falls back to the default department's From address, and marks configuration errors failed without retrying.
Outcome: ticket_page_test passes. Browser run on support-dev (Playwright): a simulated customer email with a script and an onerror image became ticket #1082; opening the original fired no dialog; a reply with refund.txt was sent (202, delivery_state sent, attachment stored) to the artur+sd-customer alias; the internal note was stored and never delivered; no horizontal overflow at 375 px.
Deviations: times show in UTC with the built-in long format until profile time zones arrive (TASK-16); CC chips are a comma-separated field.
Next: None.
<!-- SECTION:FINAL_SUMMARY:END -->
