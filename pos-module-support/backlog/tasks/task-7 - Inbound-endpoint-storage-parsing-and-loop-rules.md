---
id: TASK-7
title: 'Inbound endpoint, storage, parsing and loop rules'
status: To Do
assignee: []
created_date: '2026-10-27'
labels:
  - mvp
  - email
  - security
dependencies:
  - TASK-4
  - TASK-1
  - TASK-6
priority: high
ordinal: 1070
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Webhook page /api/support/inbound/:provider/:secret with secret check, inbound/store, inbound/process (background) calling the adapter parse_inbound (SendGrid) to the normalized email, shared helpers (addresses, charsets, sanitising, quote stripping), loop/auto-reply/spam/duplicate rules.

Spec: tech-spec 04 §0, 04 §2.
Files: public/views/pages/api/support/inbound.liquid; public/lib/commands/inbound/{store,process}.liquid; public/lib/helpers/email/{parse,strip_quotes,sanitize}.liquid; tests/fixtures/email/*
Tests: unit with fixtures captured in TASK-1
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Wrong secret → 404 and nothing stored
- [ ] #2 Valid post stored and processed in background; response 200 within 1 s
- [ ] #3 Fixtures for Gmail, Outlook, Apple Mail parse to expected body_stripped
- [ ] #4 Auto-Submitted, bulk, List-Id, mailer-daemon handled as 04 §2.4; duplicate Message-ID ignored
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
<!-- Done / Outcome / Next -->
<!-- SECTION:FINAL_SUMMARY:END -->
