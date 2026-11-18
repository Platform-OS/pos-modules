---
id: TASK-11
title: Cap MCP throughput per principal now that rate limits are per token
status: To Do
assignee: []
created_date: '2026-11-18 13:18'
labels:
  - pos-module-mcp
  - security
  - rate-limit
dependencies: []
references:
  - modules/mcp/public/lib/commands/rpc/tools_call.liquid
  - modules/mcp/public/lib/commands/resources/read_provided.liquid
  - modules/mcp/public/lib/commands/tokens/mint/check.liquid
  - modules/mcp/public/lib/helpers/config.liquid
priority: high
ordinal: 17000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Found by** a review of the commits made after the `mcp@0.2.1` release (`dee61fbb..HEAD`), carried out while adopting the module in platformos-community.

**Problem.** `e106c4ec` ("abuse auto-suspend revokes only the token that misbehaved") changed the rate-limit scope from the principal to the token:

```liquid
# commands/rpc/tools_call.liquid, commands/resources/read_provided.liquid
- assign rl_scope = 'principal:' | append: auth.principal.id
+ assign rl_scope = 'principal:' | append: auth.principal.id | append: ':token:' | append: auth.token_id
```

The isolation this buys is correct and worth keeping: one chatty agent can no longer use up another agent's budget, nor earn violations that suspend the person's other token.

What went with it is the per-person ceiling. `defaults.rate_limit_per_min` (60) is now enforced per token, and nothing caps how many active tokens one user may hold. `commands/tokens/mint/check.liquid` validates only that a chosen label is not already taken by another active manual token of the same user:

```liquid
if existing == wanted
  function c = 'modules/core/helpers/register_error', contract: c, field_name: 'label', message: 'label_taken'
```

So a user who mints 10 tokens has 600 req/min, where before the change they had 60 in total however many tokens they held. The same applies to OAuth: each grant is its own `mcp_token` row and therefore its own bucket.

**Why it matters.** An instance that grants `mcp.tokens.manage` broadly — for example by putting it on a `member` role so every user can connect a client without an operator step — gives every user an unbounded throughput multiplier that no setting bounds. The module's own opt-in model (`mcp_user` granted per person at /mcp-admin) hides this, because an operator decides who can mint at all; it is exposed as soon as minting is open.

**Proposed change.** Keep the per-token bucket and add a per-principal ceiling above it, checked in the same place:

- a second `limits/check` call scoped `principal:<id>` with its own configurable limit (suggest `defaults.rate_limit_per_min_principal`, default a small multiple of the per-token limit), **or**
- a cap on concurrently active manual tokens per user in `tokens/mint/check` (suggest `defaults.max_active_tokens_per_user`), which bounds the multiplier at the source but does nothing for OAuth grants.

The first is the more complete fix; the two are not exclusive. Whichever is chosen, document the aggregate guarantee in the README config table, since "60 requests per minute" currently reads as a per-person number.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A principal cannot exceed a configurable aggregate request rate however many active tokens or OAuth grants it holds
- [ ] #2 The per-token bucket introduced by e106c4ec still isolates agents from one another
- [ ] #3 The aggregate limit is configurable through MCP_CONFIG and documented in the README config table
- [ ] #4 A conformance test drives two tokens of one principal past the aggregate limit and asserts 429
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
