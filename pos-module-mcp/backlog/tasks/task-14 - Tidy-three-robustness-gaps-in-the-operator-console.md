---
id: TASK-14
title: Tidy three robustness gaps in the operator console
status: To Do
assignee: []
created_date: '2026-11-18 13:19'
labels:
  - pos-module-mcp
  - console
  - robustness
dependencies: []
references:
  - modules/mcp/public/lib/commands/approval/expire_due.liquid
  - modules/mcp/public/views/pages/mcp-admin.liquid
  - modules/mcp/public/views/pages/mcp-admin/token-revoke.liquid
priority: low
ordinal: 20000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Found by** a review of the commits made after the `mcp@0.2.1` release (`dee61fbb..HEAD`), carried out while adopting the module in platformos-community. Three small robustness items in the operator console, none urgent, grouped because they are all one-file changes in the same area.

---

**1. `expire_due` runs on every console load (`e9fc250e`).**

`commands/approval/expire_due` is called on each operator console load as well as from `maintenance/sweep`. It is bounded at 20 rows, but each row takes its own row lock, status change and ledger append through `approval/claim`:

```liquid
for a in due.records.results
  function c = 'modules/mcp/commands/approval/claim', id: a.id, handle: a.handle, status: 'expired', ...
```

Normally this costs one query that returns nothing. With a backlog it makes page loads slow in a way an operator cannot see the reason for, and two operators loading the console at once do the work twice. Consider leaving expiry to the sweep, lowering the per-load bound, or showing the count of rows closed so the cost is at least visible.

---

**2. The approvals display parses stored JSON with a guard that only covers blank (`8656c763`).**

`views/pages/mcp-admin.liquid`:

```liquid
assign a_args = a.arguments_json | default: '{}' | parse_json: raw_text: true
```

`default` substitutes for a blank value, not a malformed one, and `parse_json` raises on non-JSON rather than returning nil — so a row whose `arguments_json` is not valid JSON takes down the whole console page, not just that row. The value is engine-written from already-validated arguments, so this is defensive rather than a live bug, but it is the one place console rendering depends on stored data parsing cleanly. Wrap it in `{% try %}` and render the raw string on failure, as the non-Hash branch already does.

---

**3. Revoking an id that is not a token silently reports success (`5b4322e3`).**

`views/pages/mcp-admin/token-revoke.liquid`:

```liquid
graphql found = 'modules/mcp/tokens/find_by_id', id: tid
assign hit = found.records.results.first
if hit
  graphql _ = 'modules/mcp/tokens/revoke', id: hit.id
endif
redirect_to '/mcp-admin?tab=tokens'
```

The lookup is the right fix and must stay. But a miss redirects exactly like a hit, so an operator who acts on a stale id believes a token was revoked when none was. Carry a flash or a query flag and say "no such token" on the console.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Console load cost from expire_due is bounded visibly or moved to the sweep
- [ ] #2 A malformed arguments_json row cannot break the approvals page
- [ ] #3 Revoking an id that is not a token tells the operator nothing was revoked
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
