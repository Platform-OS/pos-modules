---
id: TASK-18
title: 'Settings pages'
status: To Do
assignee: []
created_date: '2026-10-27'
labels:
  - mvp
  - ui
dependencies:
  - TASK-12
  - TASK-13
  - TASK-29
priority: high
ordinal: 1180
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Departments, statuses (labels over categories), SLA policies, business hours, email templates, saved replies, assignment timings, Email (masked URLs with Reveal, Rotate secret per D-28), integrations (sweep restart). Team is TASK-29, Blocklist is TASK-31.

Spec: tech-spec 05 §3, 04 §0.2, 09 §4.
Files: public/views/pages/support-desk/settings/**; public/views/partials/support/settings/**; public/lib/commands/settings/**
Tests: E2E per section smoke; unit for dual-secret acceptance
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Only support.settings.manage can open settings
- [ ] #2 A status category is locked once used
- [ ] #3 Rotate secret updates the provider URL through the API and the old secret still works for 24 h; on provider failure both stay valid and the new URL is shown to copy
- [ ] #4 Reveal is admin-only and logged
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
<!-- Done / Outcome / Next -->
<!-- SECTION:FINAL_SUMMARY:END -->
