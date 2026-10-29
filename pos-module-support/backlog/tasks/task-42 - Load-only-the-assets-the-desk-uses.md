---
id: TASK-42
title: 'Load only the assets the desk uses'
status: In Progress
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
- [ ] #1 No EasyMDE / highlight.js / Uppy requests on desk pages
- [ ] #2 Pages still render identically (screenshots)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->
