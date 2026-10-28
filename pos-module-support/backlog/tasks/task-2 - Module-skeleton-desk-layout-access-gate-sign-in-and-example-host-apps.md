---
id: TASK-2
title: 'Module skeleton, desk layout, access gate, sign-in and example host apps'
status: Done
assignee:
  - "@arturpawlak"
created_date: '2026-10-27'
labels:
  - mvp
  - ui
  - security
dependencies:
  - TASK-1
priority: high
ordinal: 1020
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create modules/support/pos-module.json (deps, postInstall), the support layout (common-styling init, module CSS, headscripts last, push and websocket init, manifest link), the shell partial (rail + top bar, brand from helpers/branding defaults), the team_member schema, helpers/require_member + can/desk (D-24: superadmin, role map and ADMIN_EMAILS auto-membership; disabled never recreated), the no-access page with Request access, /support-desk/sign-in on the user module session command (2FA verify partial), the queue page stub, the optional admin/support redirect page, two example host apps (marketing site without members; community-style with admin role superadmin and a bouncing admin layout), demo host theme and branding hooks, and the ci-static.sh rules (every desk page has metadata.permission + require_member; module boundaries).

Spec: tech-spec 02 §2, 02 §5, 08 §1, 09 §1.
Files: modules/support/{pos-module.json, public/schema/team_member.yml, public/lib/helpers/require_member.liquid, public/lib/can/desk.liquid, public/views/layouts/support.liquid, public/views/partials/support/{shell,auth/*}.liquid, public/views/pages/support-desk/{index,sign-in,request-access}.liquid, public/views/pages/admin/support.liquid, public/assets/style/pos-support.css, public/lib/helpers/branding.liquid}; app/** (example hosts)
Tests: unit for can/desk and require_member branches; E2E scenarios 12-13 (partial)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Anonymous GET /support-desk redirects to /support-desk/sign-in (never /sessions/new)
- [x] #2 A host admin without membership gets 403 with Request access; a member gets the shell
- [x] #3 superadmin first visit creates exactly one membership with source superadmin; a disabled member is refused and not recreated
- [x] #4 In the community-style example, Support appears in the host admin menu and redirects to /support-desk
- [x] #5 ci-static.sh fails when a desk page lacks metadata.permission or require_member, or references a module outside the allowed set
- [x] #6 Host stylesheet from the example app hook loads after module CSS (computed style of .pos-button changes with the demo theme)
- [x] #7 Rail shows the brand name and logo from the example branding hook
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: Added the team_member table, the role map, can/desk, resolve_member (superadmin and ADMIN_EMAILS auto-membership), the require_member gate (include; redirect to /support-desk/sign-in, 403 no-access page with Request access), the support layout and shell with host branding and headscripts last, desk sign-in on the user module's session command (2FA verify partial, email-verification redirect, internal-only return_to), the queue stub, the admin/support redirect, the example host app and unit tests.
Outcome: On support-dev, anonymous /support-desk redirects to the desk sign-in; the superadmin test user signs in and gets the shell branded "Harbor City Permits"; a host editor with admin_pages.view gets 403 with Request access; Support appears in the example admin menu and redirects to the desk. can_desk_test and resolve_member_test pass (pos-cli test run). ci-static fails on a page without permission/require_member and on a chat reference. Host stylesheet loads after pos-support.css.
Deviations: one example app covers both hosts (marketing site at /, community-style admin at /admin) instead of two switchable apps. The team_member_created audit row waits for ticket_event (TASK-9); role_map auto-membership waits for the settings table (TASK-4); manifest and push init in the layout come with TASK-15; the Request access POST page comes with TASK-29.
Next: None.
<!-- SECTION:FINAL_SUMMARY:END -->
