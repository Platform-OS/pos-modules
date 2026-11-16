---
id: DRAFT-3
title: 'Fix serious axe violations on Settings → Email'
status: Done
assignee: []
created_date: '2026-10-28'
labels:
  - ui
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
E2E accessibility pass (03-pwa-theme-a11y.spec.ts) reports on /support-desk/settings/email: `link-in-text-block` (serious, light and dark): a link inside a paragraph is distinguished from the text only by colour; `color-contrast` (serious, dark mode): `.pos-support-ok` uses `--pos-color-confirmation`, which common-styling keeps at #167b16 in dark mode, too dark on the #141414 background.

Fix: underline links inside paragraphs in the desk; colour `.pos-support-ok` with the module's contrast-checked `--pos-support-status-solved-fg` (light #167b16, dark #8fd68f).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 axe reports no serious/critical violations on Settings → Email in light and dark mode
- [x] #2 The E2E accessibility tests pass
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: links inside paragraphs in the desk are underlined; .pos-support-ok uses --pos-support-status-solved-fg.
Outcome: no serious/critical axe violations on the nine main pages and sign-in, light and dark (E2E AX passes).
Next: None.
<!-- SECTION:FINAL_SUMMARY:END -->
