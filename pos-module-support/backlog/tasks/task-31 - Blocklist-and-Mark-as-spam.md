---
id: TASK-31
title: 'Blocklist and Mark as spam'
status: Done
assignee: []
created_date: '2026-10-27'
labels:
  - mvp
  - email
  - security
dependencies:
  - TASK-7
  - TASK-9
priority: high
ordinal: 1310
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
blocked_sender schema; blocklist/add, remove, match; inbound rule 0 before storage (200 to the provider, nothing stored, hits bumped); Settings → Blocklist (address or domain, reason, hits, last hit, unblock; confirmation for free-mail domains); Mark as spam on ticket and bulk bar moves to Spam, sets contact.blocked and blocks the address only, with Undo.

Spec: tech-spec 04 §2.4 rule 0, 05 §1, D-27.
Files: public/schema/blocked_sender.yml; public/lib/commands/blocklist/**; public/lib/queries/blocklist/**; public/views/pages/support-desk/settings/blocklist.liquid; inbound rule in commands/inbound/process
Tests: unit for match; E2E scenario 16
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A blocked address or domain (incl. subdomain) creates no inbound_email or message rows
- [x] #2 Mark as spam never creates a domain row
- [x] #3 Unblock lets the next email in
- [x] #4 Only support admins can change the blocklist
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: commands blocklist/add (address or domain, lower-cased, free-mail domains need confirm_free_mail, no duplicates) and blocklist/remove (also unblocks the contact of an address row); tickets/mark_spam and tickets/unmark_spam; Settings → Blocklist page and POST (support.settings.manage only) with hits, last hit, unblock and a confirmation step for free-mail domains; Mark as spam / Undo on the ticket page and Mark as spam in the queue bulk bar; graphql blocked_senders/create, delete, search by id/ticket/source; test blocklist_test. Inbound rule 0 (refuse before storing, bump hits) was already in inbound/store from TASK-7.
Outcome: Mark as spam moves the ticket to Spam, blocks only the requester's address (never the domain), sets contact.blocked and logs "marked_spam"; Undo removes that row, unblocks the contact and restores the previous status (an open status if it was New). Verified live on support-dev: agent gets 403 on the blocklist page and POST; gmail.com asks for confirmation; an email from a subdomain of a blocked domain got 200 from the webhook, nothing stored, hits 1; unblock removed it; Mark as spam / Undo on #1047 (it ends in Under review). 26/26 tests pass.
Next: E2E scenario 16 in TASK-25.
<!-- SECTION:FINAL_SUMMARY:END -->
