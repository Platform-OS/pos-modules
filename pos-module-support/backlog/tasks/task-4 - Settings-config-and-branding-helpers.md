---
id: TASK-4
title: 'Settings, config and branding helpers'
status: To Do
assignee: []
created_date: '2026-10-27'
labels:
  - mvp
dependencies:
  - TASK-3
priority: high
ordinal: 1040
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Helpers to read settings with a cache keyed by settings_version, the branding precedence (override → hook → defaults), and email address helpers (inbound domain, reply token build/verify).

Spec: tech-spec 08 §3, 09 §4.
Files: public/lib/helpers/{settings,branding,reply_token,email_address}.liquid
Tests: unit tests for each helper
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 branding returns override > hook > default per key (test each)
- [ ] #2 reply token verify rejects a changed number or mac
- [ ] #3 settings cache invalidates when a setting changes
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
<!-- Done / Outcome / Next -->
<!-- SECTION:FINAL_SUMMARY:END -->
