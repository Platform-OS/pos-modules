---
id: TASK-8
title: 'Threading, ticket and message creation from email, attachments'
status: Done
assignee:
  - "@arturpawlak"
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
- [x] #1 Every threading unit test in 10 §2 passes
- [x] #2 Attachments stored privately and downloadable only by permitted agents
- [x] #3 Inline images render in the thread
- [x] #4 match_reason recorded on every message
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: Added inbound/match_ticket (signed token, In-Reply-To/References newest first with ids on more than three tickets ignored, [#n] subject only from the requester, a participant or the same organization, merge pointers followed, closed → follow-up), inbound/to_ticket (contact, department from the inbound local part, new or follow-up ticket, spam status, unknown sender added as CC with an audit row), messages/create_inbound (message with match_reason, attachments, cid: rewrite, customer-reply category rule, support_message_received), attachments/store (presigned upload from Liquid with api_call_send form_data, private ACL, safe storage name, original name kept) and the download page /support-desk/attachments/:id (membership + department scope, 2-minute signed URL).
Outcome: threading_test and inbound_to_ticket_test pass on support-dev, covering every threading case in 10 §2. Live: an email sent through SendGrid to dob@support-dev.platformos.com became ticket #1047 in DOB with match_reason new, the quoted part stripped and receipt.txt stored privately; the admin gets a 302 to a signed URL, a signed-in non-member 403, anonymous a redirect to sign-in; the unsigned storage URL answers 403.
Deviations: inline images are rewritten to the desk URL here; rendering them in the thread is TASK-11's ticket page.
Next: None.
<!-- SECTION:FINAL_SUMMARY:END -->
