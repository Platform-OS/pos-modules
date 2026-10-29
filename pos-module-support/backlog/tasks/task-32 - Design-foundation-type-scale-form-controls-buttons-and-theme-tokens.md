---
id: TASK-32
title: 'Design foundation: type scale, form controls, buttons and theme tokens'
status: In Progress
assignee: []
created_date: '2026-10-29'
labels:
  - ui
  - iteration-2
dependencies: []
priority: high
ordinal: 1320
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The desk inherits common-styling defaults meant for marketing pages: monospace headings at 2.5rem, 44px controls, 16px table text. common-styling also styles only inputs whose `type` is text/email/password/url, so search, number, time, file and type-less inputs render as 21px browser boxes (white bars in dark mode). This task gives the desk its own Operate-mode foundation inside `pos-support.css`, still built from host `--pos-*` tokens (white-label).

- Desk tokens: sans heading font (`--pos-support-font-heading`, defaults to the host body font), fixed type scale (page title 1.25rem, section 1rem, body .875rem, meta .8125rem, label .75rem), 4px spacing grid, radii (control .375rem, card .5rem, pill 999px), shadows sm/md/lg, motion 120–200ms.
- One control recipe for every input type, select and textarea inside the desk (2.25rem, 2.75rem and 16px text on coarse pointers); `type="text"` on type-less inputs; placeholder colour at 4.5:1.
- Buttons: primary / secondary / ghost / danger, small size, consistent heights; `.pos-support-form-actions` footer.
- Browser surfaces: `color-scheme` light/dark, `accent-color`, `::selection`, tabular numbers for ids, counts and times.
- Dark mode: softer neutrals for the desk, `theme_mode: dark` emits both `pos-theme-dark pos-theme-darkEnabled`, support tokens switch on the same selector.
- Demo host theme: neutral rail with the brand as accent (navy kept as a documented variant).

Source: UX review of 2026-10-29 (design critique 19/40, technical audit 12/20), with findings checked against JJ's build and Linear / Front / Help Scout patterns. Reports: docs/ux/ux-review-2026-10-29.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every input, select and textarea in the desk has the same height, radius, border and focus ring in light and dark
- [ ] #2 Headings use the sans font and the desk type scale; no monospace outside code
- [ ] #3 `color-scheme` is declared; native controls and scrollbars follow dark mode
- [ ] #4 Branding theme_mode dark gives a fully dark page with ≥4.5:1 text
- [ ] #5 Ids, counts and times use tabular numbers
- [ ] #6 axe: no serious/critical violations on the main pages, light and dark
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->
