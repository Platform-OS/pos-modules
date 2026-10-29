---
id: TASK-38
title: 'Ticket properties pane'
status: Done
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
- [x] #1 Pane fits the main properties above the fold at 1440×900
- [x] #2 Priority changes with one click + Save (no-JS)
- [x] #3 Mark as spam asks for confirmation
- [x] #4 Activity readable as a timeline
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: Properties pane partial: label/value rows, segmented P0–P3 radios, compact selects that save on change (background save with a toast when a reply draft is open), tags with Save, SLA rows with relative due times, contact block with avatar, engineering link, actions (snooze, merge with confirm, mark spam as danger with confirm), activity timeline. Found and fixed: merge/unmerge did not recompute the SLA, so overdue tickets lost sla_due_at and sank to the end of the queue; unit test added (fails without the fix).
Outcome: Properties change in one click; overdue tickets sort first again. Verified on support-dev: last full E2E run 34 passed, 1 skipped (fresh install), 1 failed (scenario 15 live list update under load, passes alone twice; same intermittent delay as DRAFT-9); 26/26 Liquid unit tests pass; axe WCAG 2.2 AA 0 violations on 16 pages × light/dark × 1440/390; no sideways scroll at 390 px; platformos-check and ci-static clean.
Next: None.
<!-- SECTION:FINAL_SUMMARY:END -->
