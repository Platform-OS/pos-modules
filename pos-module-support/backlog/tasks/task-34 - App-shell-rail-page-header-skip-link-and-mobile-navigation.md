---
id: TASK-34
title: 'App shell: rail, page header, skip link and mobile navigation'
status: Done
assignee: []
created_date: '2026-10-29'
labels:
  - ui
  - iteration-2
dependencies:
  - TASK-32
  - TASK-33
priority: high
ordinal: 1340
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
- Full-height shell without the outer page gutter; sticky rail (14rem) with icon + label + count per view, section labels (Views, Workspace), Profile and Settings at the foot; hover lighter than active.
- Fix: rail counts never render (the queue page does not pass them to the shell); show them on every desk page.
- Top bar becomes the page header slot: page title and actions from the page, user menu (avatar, availability dot, profile, sign out) on the right.
- Skip-to-content link; per-page `<title>` ("All open (110) · Brand", "#1786 Subject · Brand").
- Mobile (<48rem): compact top bar with menu button; the rail opens as a drawer (works without JS via a `<details>`), no clipped horizontal strip.

Source: UX review of 2026-10-29 (design critique 19/40, technical audit 12/20), with findings checked against JJ's build and Linear / Front / Help Scout patterns. Reports: docs/ux/ux-review-2026-10-29.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Rail shows icons and counts on queue, board, ticket and settings pages
- [x] #2 Each page has its own <title>
- [x] #3 Skip link is the first tab stop
- [x] #4 At 390px the navigation is a drawer, no horizontal page scroll
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: Shell rewritten: sticky rail with Views/Workspace sections, icons and counts (fixed: the layout read support_nav instead of support_nav.nav), user block with availability and sign out, skip link, per-page <title> via export title namespace support_page, phone drawer with checkbox toggle and scrim, brand partial with dark logo.
Outcome: Counts show on every page; each page has its own title; skip link is the first tab stop; no sideways scroll at 390 px. Verified on support-dev: last full E2E run 34 passed, 1 skipped (fresh install), 1 failed (scenario 15 live list update under load, passes alone twice; same intermittent delay as DRAFT-9); 26/26 Liquid unit tests pass; axe WCAG 2.2 AA 0 violations on 16 pages × light/dark × 1440/390; no sideways scroll at 390 px; platformos-check and ci-static clean.
Next: Command palette (⌘K) not built.
<!-- SECTION:FINAL_SUMMARY:END -->
