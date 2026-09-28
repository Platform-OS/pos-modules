---
id: TASK-3.4
title: 'Richer admin — MCP access control (roles) + registry/client views'
status: Done
assignee: []
created_date: '2026-07-23'
updated_date: '2026-07-23'
labels:
  - pos-module-mcp
  - phase-3
  - admin
  - access
parent_task_id: TASK-3
priority: medium
ordinal: 3400
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Richer operator admin (spec §20): a MODULE-OWNED access model with dedicated roles
(distinct from the platform `admin`), approval-gated token minting, and a registry
view. Two roles in the module's own mcp_access table: `admin` (operator) and `user`
(approved to mint tokens). /mcp-tools is gated on approval (request → operator
approves → mint); /mcp-admin gains user/access management + a registered-tools view.
Standalone-clean: no coupling to community/user roles — only platform primitives
(context.current_user, a constant).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Module-owned mcp_access (user_id, role admin|user, status active|requested|revoked). Bootstrap: MCP_ADMIN_USER_IDS = active admin without a row (first operator on a fresh instance). VERIFIED.
- [x] #2 /mcp-tools approval-gated: level admin|user → mint; requested → "pending"; none → "Request access"; anonymous → sign in. VERIFIED live (test member restricted → request → approve → mint).
- [x] #3 /mcp-admin operator-gated via level==admin (mcp-admin role OR bootstrap). Non-operator → 403. VERIFIED (member → 403).
- [x] #4 Access management in /mcp-admin: pending requests (approve/reject), active grants (make admin / make user / revoke), grant-by-user-id. VERIFIED (approve moved member requested→active→mint).
- [x] #5 Registry view: served tools (name/version/read|write/approval/policy) + excluded manifests with errors. VERIFIED (4 tools shown).
- [x] #6 STANDALONE-CLEAN: engine has NO modules/community reference, NO member/profile.roles/current_profile coupling — its own roles + platform primitives only (grep-verified). Only dependency = user module (sessions), declared in README.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:IMPL:BEGIN -->
Files: schema/mcp_access.yml; graphql/access/{for_user,list,create,update}; lib/
commands/access/{level,decide}; views/pages/mcp-tools/request.liquid; views/pages/
mcp-admin/access.liquid; is_operator now uses access/level; /mcp-tools gate + access
page; /mcp-admin Access + Registry sections + Recent-ledger header.

PLATFORM GOTCHA (cost a debugging cycle): `return` INSIDE a for loop does NOT exit a
platformOS command (the bootstrap-admin check silently failed). Use a flag + break,
then return after the loop — same as the original is_operator. access/decide upserts
(find_by user_id → update|create). Access endpoint uses `decision` param (not
`action`, which platformOS can shadow) and `when 'a','b'` comma-fallthrough.

STANDALONE PURITY: the module owns access in mcp_access with its own admin|user roles;
NO community/user role coupling (member/moderator/profile.roles). Uses only
context.current_user (session) + MCP_ADMIN_USER_IDS constant. modules/mcp + user module
runs on a bare instance; community is only the test host + Layer-2 demo tools.
<!-- SECTION:IMPL:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Full member flow (restrict → request → approve → mint) verified live
- [x] #2 Operator gate + registry/access views verified live
- [x] #3 platformos-check passes (deploy succeeded)
- [x] #4 Standalone purity grep-verified (no community/role coupling)
- [x] #5 Bootstrap admin (MCP_ADMIN_USER_IDS) restored; return-in-loop bug fixed
<!-- DOD:END -->
