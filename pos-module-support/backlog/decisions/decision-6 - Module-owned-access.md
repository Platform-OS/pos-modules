---
id: DEC-6
title: Desk access is module-owned (team_member), standalone /support-desk
date: '2026-10-27'
status: accepted
---

## Context and decision

D-12, D-21, D-24, D-25 (revised 2026-10-28; replaces merging roles into the host permissions file). Only a team_member record grants access, checked through can_do_or_unauthorized with access_callback modules/support/can/desk. Ways in: install (first admin + ADMIN_EMAILS recovery), invite (pick existing staff = roles granting admin_pages.view, or invite external with roles: []), Request access, optional role map, superadmin. Host admins without membership get no tickets. The desk is standalone at /support-desk; an optional admin/support page only redirects into it.

## Consequences

See the referenced sections of the technical PRD. Record new evidence that contradicts this decision as a new decision rather than editing this one.
