---
id: TASK-37
title: 'Reply composer'
status: In Progress
assignee: []
created_date: '2026-10-29'
labels:
  - ui
  - iteration-2
dependencies:
  - TASK-36
priority: high
ordinal: 1370
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
- Reply / Internal note as tabs (radio inputs styled as tabs, so it works without JS); note mode tints the whole composer.
- Email-like header rows: From (department sender), To (requester), Cc inline field.
- Borderless textarea that grows; signature hint below.
- Footer: attach (paperclip button over a hidden file input, files listed as chips), saved replies select, "then set status" select and the primary Send button.
- Hardening: Send disables and reads "Sending…" on submit; submission waits until attachments are read; ⌘/Ctrl+Enter sends; leaving the page with a draft asks first.

Source: UX review of 2026-10-29 (design critique 19/40, technical audit 12/20), with findings checked against JJ's build and Linear / Front / Help Scout patterns. Reports: docs/ux/ux-review-2026-10-29.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Composer reads like an email (From/To/Cc)
- [ ] #2 Double click on Send posts once
- [ ] #3 Attachments chosen just before Send are included
- [ ] #4 ⌘/Ctrl+Enter sends; navigating away with a draft warns
- [ ] #5 Works without JS (radios, file input, selects still post)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->
