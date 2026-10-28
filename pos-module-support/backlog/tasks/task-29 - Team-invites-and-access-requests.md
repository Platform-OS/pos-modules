---
id: TASK-29
title: 'Team, invites and access requests'
status: To Do
assignee: []
created_date: '2026-10-27'
labels:
  - mvp
  - ui
  - security
dependencies:
  - TASK-2
  - TASK-3
  - TASK-14
priority: high
ordinal: 1290
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Settings → Team: members list (role, departments, job title, state, source), Add member with Pick existing staff (roles granting admin_pages.view, editable staff_roles; hidden when none) and Invite external; team_invite with digest-stored token, 7-day expiry, resend and revoke; /support-desk/invites/:id set-password and join; access_request flow with admin notification and approve/decline; disable with re-assignment of open tickets and push cleanup; last-admin guard; audit rows.

Spec: tech-spec 09 §1.3-1.5, D-24, D-25.
Files: public/schema/{team_invite,access_request}.yml; public/lib/commands/team/**; public/lib/queries/team/**; public/views/pages/support-desk/{settings/team,invites}/**; public/views/partials/support/{settings/team,auth}/**; emails team_invite, team_added, access_requested
Tests: unit per command; E2E scenarios 12-14
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Invite external creates a user with roles: [] even when USER_DEFAULT_ROLE is set; existing email adds a membership without a second user
- [ ] #2 Expired, wrong or reused token shows the same generic page
- [ ] #3 Pick existing staff lists superadmins on a community-style host and admins on a user-module-default host
- [ ] #4 Approve request gives the chosen role and departments and notifies the requester
- [ ] #5 Disable takes effect on the next request and re-assigns open tickets
- [ ] #6 The last active admin cannot be disabled or demoted
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
<!-- Done / Outcome / Next -->
<!-- SECTION:FINAL_SUMMARY:END -->
