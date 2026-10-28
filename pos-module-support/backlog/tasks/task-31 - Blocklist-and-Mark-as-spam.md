---
id: TASK-31
title: 'Blocklist and Mark as spam'
status: To Do
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
- [ ] #1 A blocked address or domain (incl. subdomain) creates no inbound_email or message rows
- [ ] #2 Mark as spam never creates a domain row
- [ ] #3 Unblock lets the next email in
- [ ] #4 Only support admins can change the blocklist
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
<!-- Done / Outcome / Next -->
<!-- SECTION:FINAL_SUMMARY:END -->
