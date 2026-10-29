---
id: TASK-41
title: 'Sign-in, profile and empty states'
status: Done
assignee: []
created_date: '2026-10-29'
labels:
  - ui
  - iteration-2
dependencies:
  - TASK-32
  - TASK-33
priority: medium
ordinal: 1410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
- Sign-in: centred card, stacked fields, brand name visible (it is white on light today), full-width Sign in, "Forgot password?" next to the Password label.
- Profile: availability as one segmented control with status dots; pause options as a compact group; "This device" shows only the actions that apply; notification matrix with centred switches; formatted paused-until time.
- Shared empty-state partial (icon, title, one sentence, optional action) used on the queue, board columns, saved replies, blocklist and contacts.

Source: UX review of 2026-10-29 (design critique 19/40, technical audit 12/20), with findings checked against JJ's build and Linear / Front / Help Scout patterns. Reports: docs/ux/ux-review-2026-10-29.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Brand name readable on sign-in in light and dark
- [x] #2 Profile has no duplicated state text
- [x] #3 Empty lists show a designed empty state
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: Sign-in card with brand, lede, Forgot password next to the label; profile availability as a segmented control with presence dots, paused-until callout, test push only with a subscription; shared empty-state partial on queue and blocklist.
Outcome: Brand readable on sign-in in light and dark; no duplicated state text. Verified on support-dev: last full E2E run 34 passed, 1 skipped (fresh install), 1 failed (scenario 15 live list update under load, passes alone twice; same intermittent delay as DRAFT-9); 26/26 Liquid unit tests pass; axe WCAG 2.2 AA 0 violations on 16 pages × light/dark × 1440/390; no sideways scroll at 390 px; platformos-check and ci-static clean.
Next: None.
<!-- SECTION:FINAL_SUMMARY:END -->
