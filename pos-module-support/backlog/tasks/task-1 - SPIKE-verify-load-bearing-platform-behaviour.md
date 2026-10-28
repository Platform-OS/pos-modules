---
id: TASK-1
title: 'SPIKE — verify load-bearing platform behaviour'
status: In Progress
assignee:
  - "@arturpawlak"
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
- [x] #4 A page can serve `/support-desk/sw.js` with Content-Type application/javascript (try `format: js`, `.js` slug, response_headers) → else record the sw-support.js fallback
- [x] #5 `/support-desk/manifest.json` slug works with `format: json`
- [x] #6 Slug params `support-desk/tickets/:id` populate `context.params.id`
- [x] #7 `background … delay:` accepts fractions and record the maximum delay the platform accepts
- [x] #8 `context.csrf_request_valid` is false for a cross-site POST without token and true with `context.authenticity_token`
- [x] #9 `compute_hmac` sha256 output is stable across requests (reply token)
- [ ] #10 SendGrid endpoints to update an Inbound Parse URL and the Event Webhook URL confirmed with the restricted key (D-28)
- [ ] #11 Probe pages removed; decision-9 written
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: Probe pages on support-dev measured service worker, manifest, slug params, background delays, CSRF, HMAC and inbound multipart handling; probes and their queued jobs deleted.
Outcome: see decision-9. Main change: SendGrid Inbound Parse must use raw MIME mode, because a multipart file part in context.params cannot be read by Liquid and crashes any page that touches context.params as a whole. The service worker is served from the module; no root fallback.
Next: #1 (real Inbound Parse post), #2, #3, #10 and the max raw-post size need the restricted SendGrid key and a test inbound hostname.
<!-- SECTION:FINAL_SUMMARY:END -->
