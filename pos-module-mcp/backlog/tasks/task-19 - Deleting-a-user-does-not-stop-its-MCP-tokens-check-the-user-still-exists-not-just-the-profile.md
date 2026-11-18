---
id: TASK-19
title: >-
  Deleting a user does not stop its MCP tokens: check the user still exists, not
  just the profile
status: To Do
assignee: []
created_date: '2026-11-18 18:05'
labels: []
dependencies: []
priority: high
ordinal: 25000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A token whose user has been deleted still authenticates and still executes tools.

Verified over real /mcp HTTP on a support-desk instance (pos-module-mcp 0.2.1):
1. Created user 35, minted a manual token. tools/list returned the tool set. Correct.
2. Deleted the user with modules/user/user/delete. The user is gone (queries/user/find returns nothing), the mcp_token row stays status active, and the PROFILE survives the delete (the user module does not remove it).
3. With the same token: tools/list returned all 6 tools, HTTP 200. tools/call on the built-in mcp_approval_status (policy mcp_authenticated) EXECUTED and answered 'No approval found for that handle.' So authentication, authorization and a handler all ran for a user that no longer exists.
4. An app tool was refused only because the app's own policy requires a support team_member record — a second, app-level control. An app whose policy admits any authenticated principal would have run it.

Cause: queries/identity/token_still_authorized checks the permission through queries/principal/can, which loads the principal's PROFILE by user_id and runs can_do on it. It never asks whether the user row exists. The orphaned profile keeps its roles array, and principal/can appends 'authenticated' itself, so the required permission still resolves. The documented kill switch 'a token whose user no longer holds mcp.tokens.manage gets 401 permission_revoked' therefore does not cover user deletion — which is the strongest form of taking access away.

Fix: treat a missing user as revoked. principal/can (or resolve_principal) should verify the user exists before the RBAC check and fail closed when it does not. Consider also revoking that user's tokens when the absence is detected, so the ledger records it rather than leaving active rows behind.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A token whose user has been deleted is refused with 401 permission_revoked, on tools/list and tools/call alike
- [ ] #2 The refusal covers built-in tools using the mcp_authenticated policy, not only app tools with their own policies
- [ ] #3 A test asserts it and fails when the user-existence check is removed
- [ ] #4 docs/security-model.md states that deleting a user stops its tokens, alongside the existing permission-revocation paragraph
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Automated tests written and passing (protocol conformance / validation / authz / ledger integrity as applicable)
- [ ] #2 platformos-check lint passes with zero errors
- [ ] #3 Docs updated (module docs/ + spec section cross-reference)
- [ ] #4 Deployed to the community test instance (staging) and smoke-checked over real /mcp HTTP
- [ ] #5 Security invariants verified — no-implicit-allow · identity-bound · args passed as typed variables (never string-interpolated) · ledger written on every post-auth termination
- [ ] #6 Change reviewed before merge
<!-- DOD:END -->
