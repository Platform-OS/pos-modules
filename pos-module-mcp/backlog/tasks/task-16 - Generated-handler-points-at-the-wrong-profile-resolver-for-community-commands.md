---
id: TASK-16
title: Generated handler points at the wrong profile resolver for community commands
status: To Do
assignee: []
created_date: '2026-11-18 14:54'
labels:
  - pos-module-mcp
  - generator
  - authorization
dependencies: []
references:
  - modules/mcp/generators/tool/templates/call_command.liquid
priority: high
ordinal: 22000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Found while** completing a generated `--op command` draft that wraps `modules/community/commands/posts/create`.

**Problem.** The generated handler suggests resolving the acting identity with the **user** module:

```liquid
# 2) Resolve the acting identity the command needs. The engine gives us `principal`
#    (principal.user_id = the real pOS user). Many community commands want a
#    `profile` or `current_profile`. Uncomment + adapt for THIS command:
# function profile = 'modules/user/queries/profiles/find', user_id: principal.user_id, ...
```

For a community command that is the wrong partial, and following it produces a tool that looks correct and fails in a way that is hard to trace.

- The community app has its own resolver, `modules/community/queries/profiles/find`, which merges the user, permissions and community-specific data. The community module's own contributor guidance is explicit that the user-module profile helper must not be used directly in community context.
- More importantly, the user-module partial returns a profile **without `relationships`**. The community authorization rules read them: `modules/community/can/groups` evaluates `requester.relationships.membership` and `requester.relationships.owner` to decide `post`, `comment`, `see_content` and the rest. With relationships absent, every membership-derived branch silently evaluates false, so a legitimate member is refused — or, for a rule written the other way round, is wrongly allowed.

The working sequence for a community command, as `modules/community/helpers/current_profile` does it for a session, is three calls rather than one:

```liquid
function profile = 'modules/community/queries/profiles/find', user_id: principal.user_id, uuid: null, id: null, slug: null, anonymous_session_id: null, relationships: null
function relationships = 'modules/community/queries/relationships/search', l_id: profile.id, limit: 100, name: null, r_id: null, include_related: null, accepted: null, approved: null
function profile = 'modules/community/queries/profiles/preload_relationships', profile: profile, relationships: relationships.results
```

**Suggested change.** The generator knows the command path it was given. When it starts with `modules/community/`, emit the community resolver and the relationships preload, with a comment saying why the preload is needed (the group rules read `requester.relationships`). For other modules keep a neutral hint that names `principal.user_id` as the input and tells the author to use their own module's profile resolver, rather than naming the user module's as if it were the general answer.

If per-module knowledge is unwanted in the generator, the alternative is to make the comment explicitly provisional — "replace with the profile resolver of the module that owns this command; if its authorization reads relationships, preload them too" — so an adopter does not copy a specific wrong call.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A draft wrapping a modules/community command resolves the profile through the community resolver
- [ ] #2 The relationships preload is emitted, with a comment saying the group rules read requester.relationships
- [ ] #3 For other modules the hint does not name a specific module's resolver as if it were general
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
