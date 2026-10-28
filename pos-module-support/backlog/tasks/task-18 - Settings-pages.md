---
id: TASK-18
title: 'Settings pages'
status: Done
assignee:
  - "@arturpawlak"
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
- [x] #1 Only support.settings.manage can open settings
- [x] #2 A status category is locked once used
- [x] #3 Rotate secret updates the provider URL through the API and the old secret still works for 24 h; on provider failure both stay valid and the new URL is shown to copy
- [x] #4 Reveal is admin-only and logged
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: Added Settings sections with a shared sub-navigation: Departments (inbound name unique and well-formed, sender address checked, one default kept), Statuses (labels over categories; category locked once a ticket used the status; system statuses stay active), SLA and hours (targets per priority in minutes, business or calendar clock, time zone, a window per weekday, holidays; several policies), Saved replies (create, edit, delete; variable help), Assignment (alert and escalation minutes, confirmation mode and period, spam threshold), Integrations (sweep heartbeat with a 15-minute stale warning and Restart). One POST endpoint support-desk/settings/save routes to a command per section. Settings → Email gained Reveal (logged as team_secret_revealed) and Rotate secret (new secret, previous one kept 24 h, provider updated through the API, URL shown to copy if the provider call fails, logged as team_secret_rotated); the inbound check moved to helpers/inbound_secret_valid. Rail "Settings" opens Departments.
Outcome: settings_test passes (dual-secret acceptance and expiry, category lock, department validation, managers lack settings permission); all 19 test files pass. Live on support-dev: all seven settings pages return 200 for the admin and 403 for the agent; Rotate updated the SendGrid Inbound Parse URL to the new secret, and both the old and new webhook URLs answered 200 while a wrong one answered 404.
Next: None.
<!-- SECTION:FINAL_SUMMARY:END -->
