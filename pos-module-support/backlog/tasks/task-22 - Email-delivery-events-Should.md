---
id: TASK-22
title: 'Email delivery events (Should)'
status: To Do
assignee: []
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
- [ ] #1 Delivered/bounce/dropped update the message
- [ ] #2 Bounced contact shows a warning in the composer
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
<!-- Done / Outcome / Next -->
<!-- SECTION:FINAL_SUMMARY:END -->
