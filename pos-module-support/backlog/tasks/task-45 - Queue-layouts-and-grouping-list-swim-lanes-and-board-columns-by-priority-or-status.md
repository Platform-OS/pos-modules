---
id: TASK-45
title: 'Queue layouts and grouping: list swim lanes and board columns by priority or status'
status: Done
assignee: []
created_date: '2026-10-29'
labels:
  - ui
  - iteration-2
dependencies: []
priority: high
ordinal: 1450
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Requested by the product owner on 2026-10-29.
- One queue page with two layouts (List, Board) and two groupings (Priority, Status).
- List: swim lanes per priority or status with a count, collapsible (state remembered in the browser), "Show all" when a lane has more than 25.
- Board: one column per priority (dragging changes the priority) or per status of the view (dragging changes the status).
- Layout and grouping are remembered in the session, so switching views in the rail keeps the board (or the list).
- /support-desk/board stays as a direct link to the board.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 List groups into collapsible swim lanes with counts by priority or status
- [x] #2 Board columns are priorities or statuses; dragging changes that field
- [x] #3 Switching views keeps the layout and grouping
- [x] #4 Previous/next on the ticket page follows the lane order
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: helpers/queue_page (layout and grouping from the request or the session key support_queue), queries/tickets/groups (one search per lane/column, one lookup), queue/head (title, Group by and List/Board switches, attention chips, filters), list swim lanes with toggle and Show all, board columns per priority or status, board/move handles priority, card Move form follows the grouping, live updates place rows in their lane, neighbors follow lane order, board keeps the D-26 card order by default; old queries/tickets/board and board_column removed and board_test rewritten for the new query.
Outcome: Agents pick List or Board and Priority or Status once and keep it while moving between views. Verified on support-dev: 26/26 Liquid unit tests (296 assertions) pass; platformos-check and ci-static clean.
Next: None.
<!-- SECTION:FINAL_SUMMARY:END -->
