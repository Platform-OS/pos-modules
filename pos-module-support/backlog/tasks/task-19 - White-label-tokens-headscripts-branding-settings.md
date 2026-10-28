---
id: TASK-19
title: 'White-label: tokens, headscripts, branding settings'
status: To Do
assignee: []
created_date: '2026-10-27'
labels:
  - mvp
  - ui
dependencies:
  - TASK-2
  - TASK-18
priority: high
ordinal: 1190
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Finish pos-support.css with only var(--pos-*) and the semantic tokens, dark-mode values, documented --pos-support-* variables, Branding settings page with source detection, preview and overrides.

Spec: tech-spec 08.
Files: public/assets/style/pos-support.css; public/views/pages/support-desk/settings/branding.liquid
Tests: E2E scenario 10; contrast check
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Grep shows no hex colours outside the semantic token block
- [ ] #2 Example dark host theme renders all screens legibly (4.5:1)
- [ ] #3 Override name appears in rail, emails, manifest and push
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
<!-- Done / Outcome / Next -->
<!-- SECTION:FINAL_SUMMARY:END -->
