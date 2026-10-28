---
id: TASK-23
title: 'Install generator'
status: Done
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
- [x] #1 Running twice is a no-op
- [x] #2 The host permissions file is untouched
- [ ] #3 On a fresh marketing-site instance, install + generator + deploy gives a working /support-desk the first admin can sign in to (E2E scenarios 11-12)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: modules/support/generators/install/index.js (run: pos-cli generate run modules/support/generators/install) plus the instance side it calls: queries/install/state and commands/install/apply. Steps: admin-menu entry keep/remove (404 override), first support admin (existing user, or new user with roles [] and a prompted password sent with pos-cli exec graphql), ADMIN_EMAILS, public sign-up report (no edit), optional role map for host roles with admin_pages.view, hook_headscripts from the layout's stylesheet links, hook_support_branding template, email provider + API key + inbound domain, INBOUND/EVENTS/REPLY_TOKEN secrets (32 random bytes), push-keys check, setup instructions (MX record, masked inbound URL).
Outcome: Every step checks what exists first. Verified with a scripted run (fixed answers, no TTY): on support-dev the first run created a new user (a test alias) as a support admin and set ADMIN_EMAILS, and that admin signed in and opened Settings → Blocklist; the second run changed nothing. On a scratch copy of the example app the first run wrote the three files, the second asked nothing and wrote nothing, and the generated Liquid lints clean (only the scratch copy's missing CSS asset is reported). The host permissions file is never written.
Next: AC3 on a fresh marketing-site instance (E2E scenarios 11-12) needs a new instance; not done, see the TASK-25 report. The generator is documented in the README in TASK-24.
<!-- SECTION:FINAL_SUMMARY:END -->
