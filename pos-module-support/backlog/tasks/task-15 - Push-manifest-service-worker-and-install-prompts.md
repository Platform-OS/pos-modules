---
id: TASK-15
title: 'Push, manifest, service worker and install prompts'
status: Done
assignee:
  - "@arturpawlak"
created_date: '2026-10-27'
labels:
  - mvp
  - pwa
dependencies:
  - TASK-14
  - TASK-1
priority: high
ordinal: 1150
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Manifest page, service worker page (or fallback from TASK-1), registration with scope /support-desk/, push via push_notifications broadcast, payloads without bodies, iOS add-to-home-screen guidance and beforeinstallprompt button.

Spec: tech-spec 07 §2, 07 §4.
Files: public/views/pages/support-desk/{manifest,sw}.liquid; public/assets/js/pos-support-pwa.js
Tests: E2E scenario 9; manual iOS and Android check
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Manifest scope and start_url are /support-desk; icons 192/512 present
- [x] #2 Service worker controls only /support-desk pages
- [ ] #3 Push for an assigned ticket opens the ticket on click
- [ ] #4 Lighthouse installability passes for /support-desk
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: Added the manifest (support-desk/manifest.json: id, scope and start_url /support-desk, standalone, brand name and colours, host icon when given plus module monogram PNGs 192 and 512), the service worker page (support-desk/sw.js, application/javascript, Service-Worker-Allowed /support-desk, imports the push module's push/notificationclick/pushsubscriptionchange handlers, adds install/activate), pos-support-pwa.js (registers the worker with the same URL the push module builds, "Install Support app" via beforeinstallprompt, iOS Add-to-Home-Screen hint), manifest/apple-touch-icon links and the push module init in the desk layout. Push keys (VAPID and sender) generated and set as constants on support-dev.
Outcome: In Chromium on support-dev the worker registers with scope /support-desk and controls desk pages; the host homepage stays uncontrolled. Manifest JSON verified.
Deviations: scope is /support-desk without a trailing slash (spec 07 updated). Not yet verified: a real push opening the ticket (#3) and Lighthouse installability (#4) need a browser with a push service and are part of the manual check in TASK-25; the push opt-in button lives on the profile page (TASK-16).
Next: TASK-16 profile device card; manual push and install check in TASK-25.
<!-- SECTION:FINAL_SUMMARY:END -->
