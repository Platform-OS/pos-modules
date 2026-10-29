---
id: TASK-46
title: 'Settings → Branding: appearance (light / dark / follow the device) works'
status: Done
assignee: []
created_date: '2026-10-29'
labels:
  - ui
  - iteration-2
dependencies: []
priority: high
ordinal: 1460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reported by the product owner on 2026-10-29: choosing Light changed nothing. Cause: the theme mode sat in the branding overrides form, whose "Use the host app's branding" checkbox is ticked by default; saving with it ticked cleared every override, the theme mode included.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Choosing Light gives a light desk on a device in dark mode
- [x] #2 Dark gives a fully dark desk
- [x] #3 Saving the branding overrides keeps the appearance
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: Appearance is its own section (Follow the device / Light / Dark) saved on its own (settings_sections/branding with only=theme_mode); every other branding save keeps it; the overrides list no longer counts the theme mode as a host override.
Outcome: Verified in the browser with a dark-mode device: Light → white desk, Dark → dark desk, Follow the device → follows; a branding save keeps the choice. support-dev left on Follow the device. Verified on support-dev: 26/26 Liquid unit tests (296 assertions) pass; platformos-check and ci-static clean.
Next: None.
<!-- SECTION:FINAL_SUMMARY:END -->
