---
id: TASK-42
title: 'Load only the assets the desk uses'
status: Done
assignee: []
created_date: '2026-10-29'
labels:
  - ui
  - iteration-2
dependencies:
  - TASK-32
priority: medium
ordinal: 1420
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The layout renders `modules/common-styling/init`, which loads the Markdown editor (EasyMDE, 327 KB), highlight.js (75 KB), Uppy CSS and about 20 stylesheets on every desk page. Load only the common-styling CSS the desk uses and none of the editor/highlighter/upload bundles.

Source: UX review of 2026-10-29 (design critique 19/40, technical audit 12/20), with findings checked against JJ's build and Linear / Front / Help Scout patterns. Reports: docs/ux/ux-review-2026-10-29.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No EasyMDE / highlight.js / Uppy requests on desk pages
- [x] #2 Pages still render identically (screenshots)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: Layout renders modules/support/head (only the common-styling CSS the desk uses, window.pos namespace, pos-debug.js) instead of modules/common-styling/init.
Outcome: No EasyMDE, highlight.js or Uppy requests on desk pages (confirmed by the after-audit). Verified on support-dev: last full E2E run 34 passed, 1 skipped (fresh install), 1 failed (scenario 15 live list update under load, passes alone twice; same intermittent delay as DRAFT-9); 26/26 Liquid unit tests pass; axe WCAG 2.2 AA 0 violations on 16 pages × light/dark × 1440/390; no sideways scroll at 390 px; platformos-check and ci-static clean.
Next: Stylesheets still load as separate files.
<!-- SECTION:FINAL_SUMMARY:END -->
