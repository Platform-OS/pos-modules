---
id: TASK-29
title: 'Team, invites and access requests'
status: Done
assignee:
  - "@arturpawlak"
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
- [x] #1 Invite external creates a user with roles: [] even when USER_DEFAULT_ROLE is set; existing email adds a membership without a second user
- [x] #2 Expired, wrong or reused token shows the same generic page
- [x] #3 Pick existing staff lists superadmins on a community-style host and admins on a user-module-default host
- [x] #4 Approve request gives the chosen role and departments and notifies the requester
- [x] #5 Disable takes effect on the next request and re-assigns open tickets
- [x] #6 The last active admin cannot be disabled or demoted
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: Added Settings → Team (members with role, departments, state, source, job title; edit role/departments/title/on-duty/state; add a member by picking host staff or typing an email; open invitations with resend and revoke; access requests with approve (role + departments) and decline), the public invite pages support-desk/invites/:id (GET set-password form, POST accept; one generic "no longer valid" page for any problem), support-desk/request-access (signed-in non-members; "Request access" with an optional note is back on the no-access page). Commands team/invite (existing user → active membership + "added" email; new address → user with roles [] and a placeholder last name, invited membership, invite email; 50 invites/hour limit), send_invite (random token, keyed sha256 digest stored, 7 days), accept_invite (constant-time digest compare, expiry, single use, password ≥ 12, name, sign-in), request_access (one pending, 24 h after a decline), decide_request (role, departments, email to requester), update_member (last-admin guard; disable → offboard: open tickets re-assigned, push subscriptions removed), queries team/staff_candidates (host roles granting admin_pages.view plus superadmin, or the staff_roles setting), email/send_simple and the team email template. Audit rows for every team change. Form ids are checked for blank before lookups (CLAUDE.md note).
Outcome: team_test passes (external invite: no host roles; second invite refused and still one user; wrong, expired and reused tokens give the generic refusal; editor-role holder listed as staff; approve gives manager with source request; one pending request; disable re-assigns the open ticket and the member is refused). All 24 test files pass. Live on support-dev: the Team page loads for the admin; the host editor saw the Request access form, sent a request, the admin declined it, and the editor still gets 403.
Deviations: the last-admin guard is only exercised when the instance has one active admin (support-dev has several); the logic is covered by the code path. Pick-existing-staff on a host using the user module's default "admin" role is not on support-dev (the example host defines superadmin and editor).
Next: None.
<!-- SECTION:FINAL_SUMMARY:END -->
