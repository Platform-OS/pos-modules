---
id: TASK-12
title: 'Make abuse auto-suspend distinct from revoke, or stop calling it suspend'
status: To Do
assignee: []
created_date: '2026-11-18 13:19'
labels:
  - pos-module-mcp
  - security
  - tokens
dependencies: []
references:
  - modules/mcp/public/graphql/tokens/suspend.graphql
  - modules/mcp/public/graphql/tokens/revoke.graphql
  - modules/mcp/public/lib/commands/limits/enforce_abuse.liquid
priority: medium
ordinal: 18000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Found by** a review of the commits made after the `mcp@0.2.1` release (`dee61fbb..HEAD`), carried out while adopting the module in platformos-community.

**Problem.** `tokens/suspend.graphql` and `tokens/revoke.graphql` are now the same operation. Both set the same value on the same table, and after `5b4322e3` added the table scoping to both, they differ only in name:

```graphql
# tokens/suspend.graphql
record: record_update(id: $id, record: {
  table: "modules/mcp/mcp_token"
  properties: [{ name: "status", value: "revoked" }]
})
```

So the abuse control is permanent revocation, not suspension. A token that trips `defaults.abuse_threshold` can never be restored; its owner has to mint a new one, and an OAuth client has to run the whole authorization flow again.

The surrounding vocabulary says otherwise. `commands/limits/enforce_abuse` is documented as "auto-suspend on abuse", writes a ledger entry with `method: "security/suspend"` and `execution_outcome: "suspended"`, returns `{ suspended: true }`, and logs `mcp.abuse_suspend`. The README and security-model describe suspension. An operator reading the ledger, or a user told their token was suspended, will reasonably expect it can be lifted.

**Why it matters.** It is a user-visible behaviour that nothing in the console or the docs explains. It is also a missed control: a timed suspension is the proportionate response to a burst of violations, where permanent revocation is the response to a compromised token. Collapsing the two removes the operator's middle option, and an operator who wants to be lenient has no way to be.

**Proposed change.** Pick one and make everything agree:

1. **Make suspension real.** Add a distinct `status` value (`suspended`) plus a `suspended_until` timestamp; `identity/resolve_principal` refuses a token whose suspension has not elapsed and lets it through once it has. Gives operators the middle option and matches every existing label.
2. **Or drop the word.** Rename the command, the ledger `method`, the `execution_outcome`, the log type and the docs to say revoke, and state in the README that crossing the abuse threshold is permanent and the token must be replaced.

Option 1 is the better control; option 2 is honest and cheap. Either way `tokens/suspend.graphql` should stop being a duplicate of `tokens/revoke.graphql`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A token stopped by the abuse threshold is either restorable, or every label and doc says revoked
- [ ] #2 tokens/suspend.graphql is no longer a byte-for-byte duplicate of tokens/revoke.graphql
- [ ] #3 The ledger entry, the log type and the README agree with the behaviour that ships
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
