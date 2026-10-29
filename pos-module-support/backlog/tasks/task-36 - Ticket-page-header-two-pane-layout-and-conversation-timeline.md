---
id: TASK-36
title: 'Ticket page: header, two-pane layout and conversation timeline'
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
ordinal: 1360
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
- Header band: back link to the queue, priority chip + #number + subject (1.25rem), status pill, department chip, needs-reply dot, "Opened … by …"; presence shown as avatars.
- Two panes: conversation (max 48rem) and a 20rem properties pane with a left border, no stacked cards.
- Timeline: avatar per message, header row (name, email, Received/Sent icon, relative time with absolute in title), body at .875rem/1.6 and 70ch; customer, agent (subtle accent tint, no 4px border) and internal note (note tint + lock icon + label) clearly different; automatic emails collapsed to a one-line summary.
- Dates: a 12-hour US locale format everywhere on the page.

Source: UX review of 2026-10-29 (design critique 19/40, technical audit 12/20), with findings checked against JJ's build and Linear / Front / Help Scout patterns. Reports: docs/ux/ux-review-2026-10-29.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Author, direction and time readable at a glance for every message
- [x] #2 Internal notes are unmistakable
- [x] #3 Automatic emails collapsed by default
- [x] #4 No horizontal scroll at 390px
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: Ticket header band (back to the originating view, #number, priority, subject, status, department, needs reply, opened), position in queue with previous/next and j/k (queries/tickets/neighbors), two-pane layout, conversation timeline with avatars, Received/Sent markers, notes with lock icon and note tint, automatic emails collapsed, times in the desk zone (helpers/display_zone + time partial). Captured markup is output with html_safe (gotcha added).
Outcome: Agents can move through a view without going back to the list; message types are distinct at a glance. Verified on support-dev: last full E2E run 34 passed, 1 skipped (fresh install), 1 failed (scenario 15 live list update under load, passes alone twice; same intermittent delay as DRAFT-9); 26/26 Liquid unit tests pass; axe WCAG 2.2 AA 0 violations on 16 pages × light/dark × 1440/390; no sideways scroll at 390 px; platformos-check and ci-static clean.
Next: None.
<!-- SECTION:FINAL_SUMMARY:END -->
