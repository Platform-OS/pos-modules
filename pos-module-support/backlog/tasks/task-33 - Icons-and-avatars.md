---
id: TASK-33
title: 'Icons and avatars'
status: In Progress
assignee: []
created_date: '2026-10-29'
labels:
  - ui
  - iteration-2
dependencies:
  - TASK-32
priority: high
ordinal: 1330
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add an icon system and avatars, the two things that make JJ's build read as a product.
- SVG sprite partial with Lucide icons (ISC), rendered once by the layout, and an `icon` partial (`<svg><use href>`), 1rem, stroke 1.75, currentColor, aria-hidden.
- Avatar partial: initials, sizes xs/sm/md/lg (1.25/1.5/2/2.5rem), colour from a fixed 8-hue semantic palette (light and dark pairs) chosen by a hash of the email.
- Status badges become pills with a category icon (new, open, pending, on hold, engineering, solved, closed); priority chips stay square so priority and status differ by shape; SLA overdue/soon use the alert icon instead of the ▲ glyphs.

Source: UX review of 2026-10-29 (design critique 19/40, technical audit 12/20), with findings checked against JJ's build and Linear / Front / Help Scout patterns. Reports: docs/ux/ux-review-2026-10-29.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Rail, queue, board and ticket page show icons from one set
- [ ] #2 Assignees, requesters and message authors show initials avatars
- [ ] #3 Status is never conveyed by colour alone (icon + text)
- [ ] #4 No unicode glyphs used as icons
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->
