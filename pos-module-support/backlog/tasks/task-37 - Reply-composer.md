---
id: TASK-37
title: 'Reply composer'
status: Done
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
- [x] #1 Composer reads like an email (From/To/Cc)
- [x] #2 Double click on Send posts once
- [x] #3 Attachments chosen just before Send are included
- [x] #4 ⌘/Ctrl+Enter sends; navigating away with a draft warns
- [x] #5 Works without JS (radios, file input, selects still post)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: Composer partial: Reply/Internal note as radio tabs (no-JS safe), From/To/Cc rows, borderless textarea, attachment button with file chips, saved replies, then-status, Send/Add note label by mode, single submission that waits for attachments, Ctrl/⌘+Enter, unsaved-draft warning, stronger focus ring.
Outcome: Double click sends once; attachments chosen just before Send are included (checked by the after-audit with intercepted requests). Verified on support-dev: last full E2E run 34 passed, 1 skipped (fresh install), 1 failed (scenario 15 live list update under load, passes alone twice; same intermittent delay as DRAFT-9); 26/26 Liquid unit tests pass; axe WCAG 2.2 AA 0 violations on 16 pages × light/dark × 1440/390; no sideways scroll at 390 px; platformos-check and ci-static clean.
Next: Server-side idempotency for Send not added (client sends once).
<!-- SECTION:FINAL_SUMMARY:END -->
