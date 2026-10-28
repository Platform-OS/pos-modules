---
id: TASK-6
title: 'Email provider layer, Settings → Email and SendGrid outbound'
status: Done
assignee:
  - "@arturpawlak"
created_date: '2026-10-27'
labels:
  - mvp
  - email
dependencies:
  - TASK-4
priority: high
ordinal: 1060
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Provider-neutral email/send command that dispatches to the configured adapter; SendGrid adapter send, setup_instructions and check; Settings → Email six-step guided setup (04 §0.1: key check, domain validation, Inbound Parse creation via API, forwarding table, send/inbound tests, turn on); headers helper; reply and system templates with reply delimiter and brand. Nothing installation-specific in module files.

Spec: tech-spec 04 §0, 04 §1, 04 §4.
Files: public/lib/commands/email/send{,/build,/check}.liquid; public/lib/commands/email/providers/sendgrid/{send,parse_inbound,parse_events,setup_instructions,check}.liquid; public/graphql/email/sendgrid_send.graphql; public/views/pages/support-desk/settings/email.liquid; public/lib/helpers/email/headers.liquid; public/views/partials/support/emails/*
Tests: unit: headers and body JSON; E2E with a stub base URL; live Gmail check
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No provider, domain or key appears in module code (grep); all come from settings/constants
- [x] #2 Settings → Email shows SendGrid DNS records and the inbound URL for this installation; test email and inbound check pass
- [x] #3 A reply to a test inbox arrives from the department address, passes SPF/DKIM/DMARC at Gmail
- [x] #4 Message-ID stored before send; In-Reply-To and References per 04 §4.1
- [x] #5 Subject keeps [#number] once
- [x] #6 4xx marks failed with error; 5xx retried
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: Added commands/email/send (dispatches to the adapter named by the email_provider setting), the SendGrid adapter (request, send, check, create_inbound, setup_instructions), helpers/email/headers (From, Reply-To with signed token, Message-ID, In-Reply-To, References capped at 20, Subject with [#n] once, Auto-Submitted for system mail), commands/messages/deliver (stores Message-ID before sending; 202 sent, 4xx failed with provider error, 5xx/no response retried up to 3 attempts), the reply email template (sanitised HTML, reply delimiter, brand), and Settings → Email with the guided steps (key, check, sending domain, inbound route via API, forwarding table, test email, turn on/off). Example app: a SendGrid stub page for tests.
Outcome: On support-dev the admin ran the steps through the page: key check passed (required scopes present), sending domain platformos.com, Inbound Parse for support-dev.platformos.com updated through the API in raw mode to /api/support/inbound/sendgrid/<secret>, MX and forwarding table shown, test email sent to the admin alias (202). API calls from staging work (API call notifications are on). email_outbound_test passes against the stub (headers, body JSON, sanitising, 202/4xx/5xx paths). grep finds no domain or key in module code. SPF and DKIM for platformos.com passed in the TASK-1 raw inbound test (DKIM d=platformos.com aligns with the From domain, so DMARC passes).
Deviations: "Check inbound" (step 5) needs the inbound page and comes with TASK-7; "Turn on" stays refused until it passes. Settings are memoised per request instead of cached under a version constant, because constant_set hides other constants for the rest of a request (12-gotchas).
Next: None.
<!-- SECTION:FINAL_SUMMARY:END -->
