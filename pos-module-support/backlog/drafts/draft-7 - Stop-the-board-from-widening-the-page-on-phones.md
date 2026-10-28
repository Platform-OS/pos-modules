---
id: DRAFT-7
title: 'Stop the board from widening the page on phones'
status: Done
assignee: []
created_date: '2026-10-28'
labels:
  - ui
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
E2E case B30 fails: at 390 px the board page is 1781 px wide (the browser zooms out). The cards' screen-reader-only "Move to" labels are absolutely positioned; the board's horizontal scroll container is not a containing block, so they escape it and stretch the document.

Fix: `position: relative` on .pos-support-board.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The board page has no horizontal page scroll at 390 px; columns scroll inside the board
- [x] #2 E2E B30 passes
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: `position: relative` on .pos-support-board.
Outcome: the board page is 390 px wide at 390 px; columns scroll inside the board (E2E B30 passes).
Next: None.
<!-- SECTION:FINAL_SUMMARY:END -->
