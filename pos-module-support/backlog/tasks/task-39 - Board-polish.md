---
id: TASK-39
title: 'Board polish'
status: In Progress
assignee: []
created_date: '2026-10-29'
labels:
  - ui
  - iteration-2
dependencies:
  - TASK-32
  - TASK-33
priority: medium
ordinal: 1390
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
- Columns bounded to the viewport height with their own scroll, tinted column panels, header with status icon, label and count chip.
- Cards: priority + #number + assignee avatar, 2-line title in text colour, department chip + requester, SLA only when at risk; hover lift.
- With JS the per-card Move form is hidden (drag and drop); a Move menu stays available per card from the keyboard; without JS the form shows.
- Empty column shows a dashed drop zone.
- Mobile: one column at a time with a status switcher; Move controls 44px.

Source: UX review of 2026-10-29 (design critique 19/40, technical audit 12/20), with findings checked against JJ's build and Linear / Front / Help Scout patterns. Reports: docs/ux/ux-review-2026-10-29.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Board page fits the viewport; columns scroll independently
- [ ] #2 Cards show no form when JS is on; keyboard users can still move a card
- [ ] #3 At 390px one column is shown with a switcher
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->
