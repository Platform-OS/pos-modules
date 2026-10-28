---
id: TASK-30
title: 'Board view'
status: Done
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
- [x] #1 Within a column P0 is above P1 and equal priorities are newest first; there is no manual reordering
- [x] #2 A refused move returns the card and explains why; the ticket is unchanged
- [x] #3 Move to works with JavaScript off and by keyboard
- [x] #4 A move in one browser updates the board and list in another
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: Board at /support-desk/board (queries/tickets/board + board_column, partials board/index + board/card, pos-support-board.js), move endpoint /support-desk/board/move (CSRF, change_status, JSON with respond=json, flash + redirect otherwise), card endpoint /support-desk/tickets/:id/card, List/Board links that keep priority, department and search, Show closed and Show more (?expand=<status>, 200 cards). Test board_test (columns, order, refused move).
Outcome: Columns follow status order, P0→P3 then newest first; Closed/Spam only with Show closed. Drag and drop and the Move form both go through change_status; a refused move (e.g. back to New) shows the reason in a toast and the card returns. The Move form works with JavaScript off and by keyboard. Other boards follow over the queue rooms; the list already does (TASK-17). Verified live on support-dev with Playwright (two browsers plus a no-JS browser) and 25/25 tests. Broadcasts normally arrive in 0.6–2.4 s; under a burst of status changes the background queue sometimes delays one by more than 20 s.
Next: axe check and E2E scenario 15 in TASK-25.
<!-- SECTION:FINAL_SUMMARY:END -->
