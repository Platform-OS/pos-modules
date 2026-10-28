---
id: TASK-15
title: 'Push, manifest, service worker and install prompts'
status: To Do
assignee: []
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
- [ ] #1 Manifest scope and start_url are /support-desk; icons 192/512 present
- [ ] #2 Service worker controls only /support-desk pages
- [ ] #3 Push for an assigned ticket opens the ticket on click
- [ ] #4 Lighthouse installability passes for /support-desk
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
<!-- Done / Outcome / Next -->
<!-- SECTION:FINAL_SUMMARY:END -->
