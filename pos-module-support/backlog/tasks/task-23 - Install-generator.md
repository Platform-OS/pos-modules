---
id: TASK-23
title: 'Install generator'
status: To Do
assignee: []
created_date: '2026-10-27'
labels:
  - mvp
  - ops
  - security
dependencies:
  - TASK-2
  - TASK-15
  - TASK-19
  - TASK-29
priority: high
ordinal: 1230
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Yeoman generator: admin-menu entry keep/remove, first support admin (existing user or new with roles: [] and a prompted password sent straight to the environment) + ADMIN_EMAILS, public sign-up check (report only), optional role map, headscripts hook, branding hook, email provider + API key + inbound domain, generated secrets, push keys via push module, SW fallback copy if chosen, provider setup instructions output. Never edits the host permissions file.

Spec: tech-spec 09 §3.
Files: modules/support/generators/install/**
Tests: E2E scenarios 11-12 on a fresh instance
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Running twice is a no-op
- [ ] #2 The host permissions file is untouched
- [ ] #3 On a fresh marketing-site instance, install + generator + deploy gives a working /support-desk the first admin can sign in to (E2E scenarios 11-12)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
<!-- Done / Outcome / Next -->
<!-- SECTION:FINAL_SUMMARY:END -->
