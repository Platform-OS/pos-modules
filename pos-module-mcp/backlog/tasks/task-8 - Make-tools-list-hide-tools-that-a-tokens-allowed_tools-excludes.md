---
id: TASK-8
title: Make tools/list hide tools that a token's allowed_tools excludes
status: To Do
assignee: []
created_date: '2026-10-15 15:57'
labels:
  - pos-module-mcp
  - authz
  - tools-list
dependencies: []
references:
  - modules/mcp/public/lib/commands/rpc/tools_list.liquid
  - modules/mcp/public/lib/commands/rpc/route.liquid
  - modules/mcp/public/lib/commands/registry/resolve_tool.liquid
  - modules/mcp/public/lib/commands/identity/token_still_authorized.liquid
  - tests/coverage.test.mjs
priority: medium
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Problem.** A token's `allowed_tools` narrows which tools it may call, but `tools/list` ignores it, so a narrowed token is still offered tools it cannot call.

- `allowed_tools` is enforced at `tools/call` by `registry/resolve_tool`, which answers "unknown tool". It is also enforced when an approved call runs, by `identity/token_still_authorized`.
- `rpc/tools_list` never looks at `agent.allowed_tools`. In the `principal` scope it filters only by each tool's authorization policy. In the `open` scope it lists the whole registry.
- `rpc/route` already passes `identity.agent` (which carries `allowed_tools`) to `tools_list` in the `principal` scope.

Result: an agent with a token narrowed to `[test_public]` sees every tool in `tools/list`. Its model is given descriptions of tools it will be refused, which costs prompt text and leads it to make calls that fail as "unknown tool". This contradicts task-1.4 AC #6: "effective = registered ∩ allowed_tools ∩ authz".

**Change.** In `rpc/tools_list`, when the caller is authenticated and `agent.allowed_tools` is non-empty, drop every tool whose name is not in it before pagination. This is the same rule `resolve_tool` uses: empty or absent means all tools, and it never widens. Built-in `mcp_` tools follow the same rule, because `resolve_tool` applies `allowed_tools` to them too.
- **`principal` scope:** filter after the policy check.
- **`open` scope:** today the list is identical for everyone and the router's cache hint is `public`. Recommended: when a bearer was presented and verified, apply the narrowing there too and send the cache hint as `private` for that response, so a shared cache never serves a narrowed list to someone else, or a full list to a narrowed token. A caller without a bearer still gets the full open list. If the reviewer prefers to keep `open` identical for every caller, document that `open` does not apply `allowed_tools` and why.
- Keep the filtering before pagination, so cursors index the visible set (existing comment in `tools_list`).

**Outcome.** `tools/list` offers a narrowed token exactly the tools `tools/call` would accept for it: registered ∩ `allowed_tools` ∩ policy.

**Found by.** MEMO : VAULT (pos-memory), 2026-10-15, while planning per-agent tool switches (pos-memory MV-62). MV-62 does not depend on this fix, because it enforces its switches in the app's authorization policy.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 In the principal scope, tools/list for the fixt-narrow token (allowed_tools [test_public]) lists test_public and none of the other tools, while fixt-member, a token of the same user with no allowed_tools, still lists every tool its policies allow (test)
- [ ] #2 Every tool that tools/list offers to a narrowed token is accepted by tools/call for that token, and every registered tool it leaves out is refused as unknown (test comparing the two)
- [ ] #3 Pagination counts only the visible tools: with a narrowed token, total and nextCursor reflect the narrowed set (test)
- [ ] #4 The open scope behaves as decided: either narrowed for a verified bearer with a private cache hint and still the full list without a bearer, or documented as not narrowing (test for the chosen behaviour)
- [ ] #5 The new list tests fail when the allowed_tools filter in tools_list is removed (planted-bug check, then restored)
- [ ] #6 README and CHANGELOG state that tools/list applies allowed_tools, and in which scopes
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
