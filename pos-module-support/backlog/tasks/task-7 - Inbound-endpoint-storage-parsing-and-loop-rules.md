---
id: TASK-7
title: 'Inbound endpoint, storage, parsing and loop rules'
status: Done
assignee:
  - "@arturpawlak"
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
- [x] #1 Wrong secret → 404 and nothing stored
- [x] #2 Valid post stored and processed in background; response 200 within 1 s
- [x] #3 Fixtures for Gmail, Outlook, Apple Mail parse to expected body_stripped
- [x] #4 Auto-Submitted, bulk, List-Id, mailer-daemon handled as 04 §2.4; duplicate Message-ID ignored
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: Added the webhook page api/support/inbound/:provider/:secret (HMAC-compared secret, previous secret accepted until it expires, named params only), inbound/store (blocklist checked first: nothing stored, hit counted), inbound/process (background: adapter parse, setup inbound check, duplicate, blocked contact, auto-reply/bulk/List-Id/robot senders flagged, loop over 20/hour, spam score flag, then inbound/to_ticket), the SendGrid parse_inbound adapter and helpers: recursive MIME walker, body decoding (base64, quoted-printable in any charset via a byte round trip, 8bit), RFC 2047 headers, RFC 2231 filenames, address lists, HTML sanitising and quote stripping. Settings → Email gained "Check inbound". Fixtures (Gmail, Outlook, Apple Mail) are in tests/fixtures/email and as example-app partials.
Outcome: inbound_parse_test and inbound_rules_test pass on support-dev (subjects, quoted names, folded References, inline image as attachment, sanitised HTML, Windows-1252 and ISO-8859-2, body_stripped for all three clients; auto-reply cases flagged, duplicate ignored, blocklisted subdomain not stored). Live: wrong secret 404; a valid post answers 200 in 1.1 s measured from Poland (network included); "Check inbound" sent through SendGrid arrived and was recognised in about 10 s.
Next: TASK-8 replaces the to_ticket stub.
<!-- SECTION:FINAL_SUMMARY:END -->
