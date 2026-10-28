---
id: TASK-1
title: 'SPIKE — verify load-bearing platform behaviour'
status: To Do
assignee: []
created_date: '2026-10-27'
labels:
  - spike
  - mvp
dependencies:
  - TASK-0
priority: high
ordinal: 1010
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Deploy throwaway probe pages (delete them afterwards) and record each answer in backlog/decisions/decision-9 (create it). A failing answer changes the design: stop and write the decision before other tasks continue.

Spec: tech-spec 01, 04 §2.3, 04 §4.2, 07 §4, 06 §4.
Files: temporary pages only
Tests: manual probes; results in decision-9
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A SendGrid Inbound Parse post (real email to the inbound host) arrives at a `method: post` page: list the exact `context.params` keys and whether attachment file parts are readable (base64 obtainable) → choose attachment path A or B (04 §2.3)
- [ ] #2 SendGrid Mail Send keeps a custom `Message-ID` header (send to a Gmail test inbox and read the original) → if not, record X-Message-Id fallback
- [ ] #3 Outbound attachments: choose client-side base64 (A) or download link (B)
- [ ] #4 A page can serve `/support-desk/sw.js` with Content-Type application/javascript (try `format: js`, `.js` slug, response_headers) → else record the sw-support.js fallback
- [ ] #5 `/support-desk/manifest.json` slug works with `format: json`
- [ ] #6 Slug params `support-desk/tickets/:id` populate `context.params.id`
- [ ] #7 `background … delay:` accepts fractions and record the maximum delay the platform accepts
- [ ] #8 `context.csrf_request_valid` is false for a cross-site POST without token and true with `context.authenticity_token`
- [ ] #9 `compute_hmac` sha256 output is stable across requests (reply token)
- [ ] #10 SendGrid endpoints to update an Inbound Parse URL and the Event Webhook URL confirmed with the restricted key (D-28)
- [ ] #11 Probe pages removed; decision-9 written
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
<!-- Done / Outcome / Next -->
<!-- SECTION:FINAL_SUMMARY:END -->
