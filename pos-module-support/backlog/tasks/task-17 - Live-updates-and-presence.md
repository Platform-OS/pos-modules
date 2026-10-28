---
id: TASK-17
title: 'Live updates and presence'
status: To Do
assignee: []
created_date: '2026-10-27'
labels:
  - mvp
  - ui
dependencies:
  - TASK-10
  - TASK-11
priority: high
ordinal: 1170
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
websocket rooms per department, ticket and user; broadcast consumers; queue row refresh; presence viewing/replying; new-message warning before send.

Spec: tech-spec 05 §4.
Files: public/lib/consumers/*/broadcast_*.liquid; public/views/partials/channels/**; public/assets/js/pos-support-live.js
Tests: E2E scenario 5
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Second browser sees a new ticket row without reload
- [ ] #2 Presence shows within 20 s
- [ ] #3 Sending after a new customer message requires acknowledging the warning
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
<!-- Done / Outcome / Next -->
<!-- SECTION:FINAL_SUMMARY:END -->
