---
id: TASK-43
title: 'UX verification: screenshots, axe, E2E and re-review'
status: Done
assignee: []
created_date: '2026-10-29'
labels:
  - ui
  - iteration-2
dependencies:
  - TASK-35
  - TASK-36
  - TASK-37
  - TASK-38
  - TASK-39
  - TASK-40
  - TASK-41
  - TASK-42
priority: high
ordinal: 1430
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Re-run the screenshot set (1440 and 390, light and dark) and axe on every desk page, run the full E2E suite and the unit tests, and re-score with the same critique and audit method used for the review. Record before/after scores and screenshots in docs/ux/.

Source: UX review of 2026-10-29 (design critique 19/40, technical audit 12/20), with findings checked against JJ's build and Linear / Front / Help Scout patterns. Reports: docs/ux/ux-review-2026-10-29.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 E2E suite and unit tests pass
- [x] #2 axe: no serious/critical violations light and dark
- [x] #3 Before/after scores recorded
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: Before/after screenshots, axe sweep, three full E2E runs, unit tests, and an independent re-review with the same critique and audit methods; results in docs/ux/ux-review-2026-10-29.md.
Outcome: Design review 19 → 28/40, technical audit 12 → 16/20, axe 0 violations. E2E tests adjusted for the new markup (priority radios, auto-save, brand selector, dialogs accepted, own-ticket filter in scenario 3). Verified on support-dev: last full E2E run 34 passed, 1 skipped (fresh install), 1 failed (scenario 15 live list update under load, passes alone twice; same intermittent delay as DRAFT-9); 26/26 Liquid unit tests pass; axe WCAG 2.2 AA 0 violations on 16 pages × light/dark × 1440/390; no sideways scroll at 390 px; platformos-check and ci-static clean.
Next: Items listed under Still open in the review.
<!-- SECTION:FINAL_SUMMARY:END -->
