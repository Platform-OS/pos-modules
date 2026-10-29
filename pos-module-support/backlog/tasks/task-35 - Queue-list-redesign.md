---
id: TASK-35
title: 'Queue list redesign'
status: Done
assignee: []
created_date: '2026-10-29'
labels:
  - ui
  - iteration-2
dependencies:
  - TASK-32
  - TASK-33
  - TASK-34
priority: high
ordinal: 1350
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
- Header: title + count, List/Board segmented switch, search with icon; filters as compact selects that submit on change (Filter button kept for no-JS); priority filter as pills with counts.
- Attention strip as tinted stat chips ("90 Needs reply", "2 SLA at risk", "0 Waiting on deploy" muted at 0).
- Bulk bar shown only when rows are selected (JS); without JS it stays reachable. Bulk Mark as spam asks for confirmation naming the count and is visually separated as a danger action.
- Table: 13–14px text, fixed column widths, one-line cells with ellipsis (≈44px rows), sticky small-caps header, subject in text colour (bold + dot when it needs a reply), whole row clickable, department chip, status pill, assignee avatar + name, SLA with icon, 40px checkbox hit area.
- Footer: "1–50 of 110" with previous/next icon buttons; keyboard hint line.
- Mobile: rows render as cards from the same markup; filters collapse into a disclosure.
- Empty state partial for an empty view and for no search results.

Source: UX review of 2026-10-29 (design critique 19/40, technical audit 12/20), with findings checked against JJ's build and Linear / Front / Help Scout patterns. Reports: docs/ux/ux-review-2026-10-29.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Rows are a fixed height with no wrapping at 1440px
- [x] #2 Bulk bar hidden until a row is selected (JS on); bulk spam asks for confirmation
- [x] #3 Checkbox hit area ≥24px (44px on touch)
- [x] #4 At 390px tickets start within the first screen and there is no sideways scroll
- [x] #5 Empty view shows a designed empty state
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: Queue: List/Board switch, attention chips, search with icon, filters and sort apply on change (button kept for no-JS), assignee filter, sort (SLA, priority, activity, newest, oldest), activity column, fixed-width one-line rows, row-wide link, 44px checkbox targets, contextual bulk bar with count and confirmation on bulk spam, range + prev/next pagination, shortcut hint, empty states, card layout on phones. Rows link with the view and filters so the ticket page can offer previous/next.
Outcome: About 45px rows at 1440; bulk bar only with a selection; phones show cards. Verified on support-dev: last full E2E run 34 passed, 1 skipped (fresh install), 1 failed (scenario 15 live list update under load, passes alone twice; same intermittent delay as DRAFT-9); 26/26 Liquid unit tests pass; axe WCAG 2.2 AA 0 violations on 16 pages × light/dark × 1440/390; no sideways scroll at 390 px; platformos-check and ci-static clean.
Next: Group-by (priority/status) not built.
<!-- SECTION:FINAL_SUMMARY:END -->
