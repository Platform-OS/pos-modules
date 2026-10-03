---
id: DEC-2
title: MCP bearer token source = instance-issued tokens bound to real pOS users
date: '2026-07-23'
status: accepted
---

## Decision

The `/mcp` resource server authenticates **instance-issued bearer tokens bound to
a real platformOS `user_id`** (the principal), NOT JWTs from an external
authorization server. Chosen by the user over the pure external-AS/JWT model
(spec §9.5) and over a pluggable both-paths option.

## Why

- The demo/build instance has **no external Authorization Server**, so the
  standards-pure OAuth-JWT path (`jwt_decode` against issuer/JWKS) cannot be
  exercised end to end here.
- The platform already owns the **login front door**: `pos-module-user` sessions
  + `oauth_google`/`oauth_github`. A user signs in through that, then mints an MCP
  bearer at `/mcp-tools`. Reuses existing auth instead of standing up an IdP.
- `pos-module-user` has **no self-identifying long-lived API-token primitive**
  (`is_token_valid` needs the user_id alongside the token, i.e. it validates, it
  does not resolve identity). So the module owns a small `mcp_token` record that
  maps a bearer to a `user_id` — the same proven pattern as the prior
  community-solution-mcp.

## Shape

- `schema/mcp_token.yml`: `user_id`, `token_digest` (sha256 hex — raw token shown
  ONCE, never stored), `label`, `status` (active|revoked), `allowed_tools`,
  `last_used_at`.
- `identity/resolve_principal`: `Authorization: Bearer <raw>` → `digest:'sha256'`
  → `tokens/find_by_digest` → active? → principal = `{ id: 'user:<user_id>' }`.
  Revoked/absent → 401. Fail-closed throughout; no token internals on the wire;
  pre-auth failures logged, never chained (ledger DoS guard).
- Delegation: v1 tokens are **direct** (agent acts AS the user). The
  `delegation_mode` / agent fields stay in the ledger + principal contract so
  `on_behalf_of` can be added without a data-model change.

## External-AS/JWT path — deferred, not deleted

`jwt_decode` was verified working (HS*/RS*, enforces `exp`, raises on bad
signature/expiry). The JWT resolver is kept documented as the second strategy for
when an instance fronts a real AS; `resolve_principal` can dispatch by token shape
(JWT = two dots) later. No code depends on it in v1.
