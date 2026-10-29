---
id: TASK-38
title: 'Ticket properties pane'
status: In Progress
assignee: []
created_date: '2026-10-29'
labels:
  - ui
  - iteration-2
dependencies:
  - TASK-36
priority: high
ordinal: 1380
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
- Sections with small labels instead of cards: Properties, SLA, Contact, Links, Activity.
- Priority as a 4-segment control (radios styled as segments, no-JS safe); status, assignee, department as compact selects; tags field; one Save.
- SLA rows: "First reply · due in 17 h" / "Resolution · due Nov 10" with a state chip; absolute time in title.
- Contact block with avatar, email, organisation link and other tickets.
- Less frequent actions (snooze, link GitHub issue, merge) grouped under "More actions" disclosures; Mark as spam styled as a danger action with a confirmation.
- Activity as a compact timeline with dots and relative times; long lists collapsed after 8.

Source: UX review of 2026-10-29 (design critique 19/40, technical audit 12/20), with findings checked against JJ's build and Linear / Front / Help Scout patterns. Reports: docs/ux/ux-review-2026-10-29.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Pane fits the main properties above the fold at 1440×900
- [ ] #2 Priority changes with one click + Save (no-JS)
- [ ] #3 Mark as spam asks for confirmation
- [ ] #4 Activity readable as a timeline
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->
