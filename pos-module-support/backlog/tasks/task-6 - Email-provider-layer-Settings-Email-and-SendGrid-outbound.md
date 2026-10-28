---
id: TASK-6
title: 'Email provider layer, Settings → Email and SendGrid outbound'
status: To Do
assignee: []
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
- [ ] #1 No provider, domain or key appears in module code (grep); all come from settings/constants
- [ ] #2 Settings → Email shows SendGrid DNS records and the inbound URL for this installation; test email and inbound check pass
- [ ] #3 A reply to a test inbox arrives from the department address, passes SPF/DKIM/DMARC at Gmail
- [ ] #4 Message-ID stored before send; In-Reply-To and References per 04 §4.1
- [ ] #5 Subject keeps [#number] once
- [ ] #6 4xx marks failed with error; 5xx retried
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
<!-- Done / Outcome / Next -->
<!-- SECTION:FINAL_SUMMARY:END -->
