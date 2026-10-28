---
id: TASK-4
title: 'Settings, config and branding helpers'
status: Done
assignee:
  - "@arturpawlak"
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
- [x] #1 branding returns override > hook > default per key (test each)
- [x] #2 reply token verify rejects a changed number or mac
- [x] #3 settings cache invalidates when a setting changes
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: Added helpers/settings (all settings as parsed JSON, one query, cached under the constant SETTINGS_VERSION), commands/settings/set (writes JSON, bumps the version with constant_set and exports it so the same request reads fresh values), helpers/reply_token (build and verify t.<number>.<mac16>, HMAC-compared), helpers/email_address (build the inbound/reply address from the inbound_domain setting, parse local part, token and domain), the branding_override layer in helpers/branding, and role_map auto-membership in resolve_member (deferred from TASK-2).
Outcome: helpers_test and resolve_member_test pass on support-dev: token round trip, changed number, changed mac and garbage rejected; a changed setting is visible on the next read; branding gives override > hook > default per key; a role_map host role gets the mapped role with source role_map. REPLY_TOKEN_SECRET is set on support-dev (copy kept outside the repo). README lists the constants and role_map.
Next: None.
<!-- SECTION:FINAL_SUMMARY:END -->
