---
id: TASK-22
title: 'Email delivery events (Should)'
status: Done
assignee:
  - "@arturpawlak"
created_date: '2026-10-27'
labels:
  - email
dependencies:
  - TASK-6
priority: medium
ordinal: 1220
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Events endpoint /api/support/email-events/:provider/:secret with secret; adapter parse_events (SendGrid); delivery_state updates via custom_args; hard bounce flags contact.

Spec: tech-spec 04 §6.
Files: public/views/pages/api/support/email_events.liquid; public/lib/commands/email/providers/sendgrid/parse_events.liquid
Tests: unit with event fixtures
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Delivered/bounce/dropped update the message
- [x] #2 Bounced contact shows a warning in the composer
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: Added the events endpoint api/support/email-events/:provider/:secret (EVENTS_SECRET, HMAC-compared; the JSON array arrives as context.params._json, checked with a temporary probe since removed), the SendGrid parse_events adapter (only events carrying our support_message_id; delivered/bounce/blocked/dropped/spamreport/deferred), email/apply_event (delivery_state updated, a late delivered never undoes a bounce or drop, hard bounce marks the contact bounced, failures logged on the ticket), save_events_webhook (creates the module's own Event Webhook or updates it by stored id), the "Delivery tracking" step in Settings → Email, and the composer warning for a bounced requester.
Outcome: delivery_events_test passes (foreign events ignored; delivered, bounced, dropped applied; contact flagged; bounce kept); all 23 test files pass. Live: the step created a "Support desk" Event Webhook pointing at support-dev while the account's existing webhook (hooks.sendwithus.com) stayed unchanged; a wrong secret gets 404.
Next: None.
<!-- SECTION:FINAL_SUMMARY:END -->
