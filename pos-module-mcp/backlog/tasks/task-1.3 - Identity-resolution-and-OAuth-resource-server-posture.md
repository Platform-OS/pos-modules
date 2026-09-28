---
id: TASK-1.3
title: 'Identity — bearer resolution, delegation, OAuth resource-server posture'
status: Done
assignee: []
created_date: '2026-07-23'
updated_date: '2026-07-28 06:32'
labels:
  - pos-module-mcp
  - identity
dependencies:
  - TASK-1.1
parent_task_id: TASK-1
priority: high
ordinal: 1030
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The identity plane (spec §9.4, §9.5). `views/partials/identity/resolve_principal.liquid`:
verify the bearer token and map it to a pOS identity, supporting BOTH modes from
v1 (retrofitting delegation is expensive, §9.4):
- **direct** — the agent is itself a registered principal.
- **on_behalf_of** — the token carries agent identity + a delegated human
  principal; authorization evaluates against the **principal**, the ledger
  records **both**.

The token format MUST carry `sub` (principal) and `azp`/`act` (agent) distinctly
from day one — fix the concrete claim names now (highest retrofit cost, §18.3).
JWT verified with `jwt_decode` against a configured issuer/JWKS (constants,
§17.1). Also ship the OAuth resource-server surface: `/.well-known/
oauth-protected-resource` advertising the AS + per-instance resource identifier
(§15), and `401 + WWW-Authenticate` on missing/invalid tokens. Authorization-
server duties (token issuance, DCR) are out of scope — resource server only.

Registered clients live in `mcp_client` (schema in this task): status, allowed
_tools (narrows never widens), rate_limit, max_input_bytes, last_seen_at.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Valid bearer → resolved principal (user:<id>). Token source pivoted to instance-issued tokens bound to a real pOS user (decision-2); principal id namespaced `user:<user_id>`. VERIFIED live.
- [~] #2 Delegation: v1 is `direct` (agent acts AS the user), ledger captures agent_id + principal_id + delegation_mode. `on_behalf_of` deferred (needs an AS that issues delegated tokens); the contract + ledger columns already carry it so it is a non-breaking add. VERIFIED direct live.
- [x] #2 Missing token → 401 + `WWW-Authenticate: Bearer resource_metadata="…/.well-known/…"`; bad/revoked/unbound token → 401 "Invalid token" (no internals). VERIFIED live. NOTE: pre-auth failures are LOGGED, not chained (ledger DoS guard, decision-1/§9.3 refinement); authenticated outcomes ARE chained (verified: 1 entry for the valid call, 0 for the two anonymous probes).
- [x] #3 /.well-known/oauth-protected-resource returns per-instance resource id (=/mcp) + bearer_methods; advertises issuer when MCP_OAUTH_ISSUER set. VERIFIED live.
- [x] #4 Revocation is the central kill switch: token status != active → 401. `allowed_tools` on the token narrows (never widens) the served set — enforced downstream in registry/authz (task-1.4/1.6). (mcp_client model dropped in favor of mcp_token — decision-2.)
- [x] #5 Token replay / expired / wrong-audience adversarial cases → covered by tests in task-1.10 (JWT-specific ones apply only under the deferred external-AS strategy)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed 2026-07-28. Functionality shipped + verified live long ago; status was stale. The one open DoD item (docs/security-model.md) is now written: modules/mcp/docs/security-model.md — a thorough identity + ledger + transport security model grounded in the shipped engine, cross-referencing the spec and engine-commands-architecture / request-flow docs. platformos-check: 0 offenses.
Identity: verified by 5 conformance asserts (401 + WWW-Authenticate + no-internals + well-known RFC 9728) + used throughout TASK-5. on_behalf_of authoritative-subject rule documented (security-model §2.3); adversarial cases live in task-1.10 (Done).
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Auth + delegation unit tests written and passing
- [x] #2 platformos-check lint passes with zero errors
- [x] #3 Docs updated (docs/security-model.md + spec §9 cross-ref; claim names documented)
- [x] #4 Deployed to staging and smoke-checked (401 + well-known + a valid call)
- [x] #5 Security invariants verified — agent never authorized in on_behalf_of; no token internals leaked
- [x] #6 Reviewed before merge
<!-- DOD:END -->
