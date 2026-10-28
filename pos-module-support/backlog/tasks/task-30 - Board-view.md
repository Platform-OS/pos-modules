---
id: TASK-30
title: 'Board view'
status: To Do
assignee: []
created_date: '2026-10-27'
labels:
  - mvp
  - ui
dependencies:
  - TASK-10
  - TASK-9
  - TASK-17
priority: high
ordinal: 1300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
List/Board switch keeping filters; tickets/board query (per status column: priority p0→p3 then created_at desc, 50 per column + Show more, counts); cards; drag and drop to change status through tickets/update with the same rules; Move to menu as a real form for no-JS and keyboard; live updates through the queue room; Closed and Spam only with Show closed.

Spec: tech-spec 05 §2-3, D-26.
Files: public/views/pages/support-desk/board{,/move}.liquid; public/views/partials/support/board/*; public/lib/queries/tickets/board.liquid; public/assets/js/pos-support-board.js
Tests: E2E scenario 15; axe check
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Within a column P0 is above P1 and equal priorities are newest first; there is no manual reordering
- [ ] #2 A refused move returns the card and explains why; the ticket is unchanged
- [ ] #3 Move to works with JavaScript off and by keyboard
- [ ] #4 A move in one browser updates the board and list in another
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
<!-- Done / Outcome / Next -->
<!-- SECTION:FINAL_SUMMARY:END -->
