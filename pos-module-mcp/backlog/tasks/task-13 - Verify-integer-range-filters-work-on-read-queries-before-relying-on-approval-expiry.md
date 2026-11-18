---
id: TASK-13
title: >-
  Verify integer range filters work on read queries before relying on approval
  expiry
status: To Do
assignee: []
created_date: '2026-11-18 13:19'
labels:
  - pos-module-mcp
  - approvals
  - correctness
dependencies: []
references:
  - modules/mcp/public/graphql/approvals/expired_pending.graphql
  - modules/mcp/public/lib/commands/approval/expire_due.liquid
priority: medium
ordinal: 19000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Found by** a review of the commits made after the `mcp@0.2.1` release (`dee61fbb..HEAD`), carried out while adopting the module in platformos-community.

**Problem.** `e9fc250e` added `graphql/approvals/expired_pending.graphql`, which filters an integer property with a `String!` variable on a **read** query:

```graphql
query expired_pending($now: String!, $per_page: Int!) {
  records(
    filter: {
      table: { value: "modules/mcp/mcp_pending_approval" }
      properties: [
        { name: "status", value: "pending" }
        { name: "expires_at", range: { lt: $now } }
      ]
```

`expires_at` is declared `type: integer` in `schema/mcp_pending_approval.yml`, and `commands/approval/expire_due` passes `'now' | to_time | strftime: '%s'`, a string.

This shape is established in the module, but only inside `records_delete_all` mutations — `idempotency/sweep.graphql`, `oauth/code_sweep.graphql` and now `tokens/retired_refresh_sweep.graphql`. As of 0.2.1 no **read** query used a `range` filter at all, so whether the record API compares the integer property against a string variable the same way on the query path is unverified.

**Why it matters.** The failure mode is silent. If the filter matches nothing, `expire_due` closes no rows: pending approvals never move to `expired`, the ledger never records how they ended (the very gap `e9fc250e` was written to close), and `approval_max_pending_per_principal` keeps counting rows that should have lapsed, so a principal's approval queue fills up and stays full. Nothing errors and nothing is logged.

A lexicographic comparison of 10-digit unix seconds happens to order correctly, so the bug would not show up in a quick test even if the value were being treated as a string — which makes a deliberate probe worth more than an incidental one.

**Proposed change.**

1. Probe it on an instance: seed one `mcp_pending_approval` row with `expires_at` in the past and one in the future, run the query with `now` as both a string and an int, and confirm it returns exactly the lapsed row.
2. If the string form is unreliable, change the variable to `Int!` and pass `| plus: 0`; check the three sweep mutations for the same issue while there.
3. Add a conformance assertion that a pending approval past its window is reported `expired` and carries a ledger entry, so a regression here fails loudly instead of silently stalling the queue.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A pending approval past its window is proven to move to expired on a real instance
- [ ] #2 The variable type matches the property type, or the string form is proven correct on the read path
- [ ] #3 A conformance assertion fails loudly if expiry stops working
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
