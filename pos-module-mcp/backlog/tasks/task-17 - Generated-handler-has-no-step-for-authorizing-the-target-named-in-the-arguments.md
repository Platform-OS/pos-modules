---
id: TASK-17
title: >-
  Generated handler has no step for authorizing the target named in the
  arguments
status: To Do
assignee: []
created_date: '2026-11-18 14:54'
labels:
  - pos-module-mcp
  - generator
  - security
dependencies: []
references:
  - modules/mcp/generators/tool/templates/call_command.liquid
  - tests/lib/lint-tools.mjs
priority: high
ordinal: 23000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Found while** completing a generated `--op command` draft into a production tool (`create_post` wrapping `modules/community/commands/posts/create`).

**Problem.** The generated handler lists four things to complete:

```
 1. Map arguments → the object keys THIS command expects
 2. Pass the identity/extra params THIS command needs
 3. Confirm the success fields you surface
```
plus setting a named `authorization_policy` in the manifest.

None of them is "check that the caller may act on the specific target named in the arguments". That check is usually the largest and most security-relevant part of the handler, and its absence is invisible: a tool that omits it passes the meta-schema, passes the static linter, deploys, and answers every call successfully.

In the real case the named policy (`members_can_write`) can only decide *that a member may call the tool*. It cannot decide *which group they may write to*, because that depends on an argument. The handler has to do it:

```liquid
function group = 'modules/community/queries/groups/find', id: arguments.group_id, ...
function can_post = 'modules/user/helpers/can_do', requester: profile, do: 'post', entity: group, access_callback: 'modules/community/can/groups'
unless can_post
  # 403, refuse
endunless
```

Without those lines the tool still works — it just lets any member post into any group, including private ones they have never joined. That is an IDOR, shipped by an adopter who completed every TODO the generator gave them.

The docs do cover the principle: `authoring-tools.md` has "Authorized is not the same as should be published" and the policy example shows an owner check. But the scaffold is what an adopter actually fills in, and the scaffold is silent about it.

**Suggested change.** Add a numbered TODO in the generated handler, between identity resolution and invoking the command, along the lines of:

```liquid
# 3) AUTHORIZE THE TARGET. The manifest policy decided that this caller may use the
#    tool. It did not decide whether they may act on the record named in the
#    arguments. If any argument selects a record (an id, a slug, a parent), load it
#    and check the caller is permitted on THAT record before continuing. Skipping
#    this is how a tool becomes an IDOR: the call succeeds and nothing flags it.
```

When the discovered fields include something id-shaped (`*_id`, `id`, `*_uuid`), make the TODO specific by naming that field, since that is the strongest signal the generator has that a target is being selected.

Worth considering alongside this: the static linter could warn when a mutating tool takes an id-shaped argument and its handler contains no `can_do` / `access_callback` / policy call — a heuristic, so `info` or `warn` rather than `error`, but it would catch the same omission at review time.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The generated handler carries a numbered TODO for authorizing the record an argument selects
- [ ] #2 The TODO names the id-shaped argument when discovery found one
- [ ] #3 Decide whether the static linter should warn on a mutating tool with an id argument and no authorization call in its handler
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
