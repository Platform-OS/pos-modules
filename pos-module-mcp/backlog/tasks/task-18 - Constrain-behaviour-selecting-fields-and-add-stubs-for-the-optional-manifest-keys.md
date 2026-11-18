---
id: TASK-18
title: >-
  Constrain behaviour-selecting fields and add stubs for the optional manifest
  keys
status: To Do
assignee: []
created_date: '2026-11-18 14:54'
labels:
  - pos-module-mcp
  - generator
dependencies: []
references:
  - modules/mcp/generators/tool/templates/manifest.liquid
priority: low
ordinal: 24000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Found while** comparing a generated `--op command` draft against a hand-written tool wrapping the same command. Two small gaps in what the scaffold declares, neither urgent.

---

## 1. Fields that select behaviour are exposed as free strings

Discovery lifts every `object.<key>` the command's `build.liquid` reads, including keys that choose a code path rather than carry content. Wrapping `modules/community/commands/posts/create` produced:

```json
"entity_type":{"type":"string","maxLength":255}
```

`entity_type` decides whether the post attaches to a group, an event or a profile, and the site's own page branches on it to pick which record to load and which permission to check. Handing it to the agent as an unconstrained string lets the agent assert which kind of thing it is posting to, which is the sort of argument a reviewer should either fix in the handler or restrict to an enum.

The generator cannot know which keys are behavioural. But a key whose discovered name ends in `_type`, `_kind`, `_status` or `status` is a reasonable heuristic, and a one-line TODO on those fields — "this value selects behaviour; constrain it with an enum or set it in the handler instead of accepting it from the agent" — costs nothing and points at a real class of mistake.

---

## 2. No stubs for the optional manifest keys

The generated manifest declares `name`, `version`, `description`, `input_schema`, `mutating`, `authorization_policy`, `requires_approval`, `handler`. It never mentions `output_schema`, `annotations`, `audit_fields`, `title` or `idempotent`, so an adopter working only from the scaffold does not learn they exist.

`output_schema` is the one that now matters: since results are validated against it before they are served, it is the only way to state what a tool may return, and `additionalProperties: false` on it is the allowlist that stops a handler leaking an internal id or another user's field. A tool scaffolded today declares nothing and gets no such guarantee.

Commented-out stubs would be enough:

```liquid
# "title": "Human readable name shown by clients",
# "output_schema": {"type":"object","additionalProperties":false,"required":[],"properties":{}},
# "annotations": {"readOnlyHint":false,"destructiveHint":false,"idempotentHint":false,"openWorldHint":false},
# "audit_fields": recorded verbatim in the ledger — non-sensitive keys only,
# "idempotent": true,
```

For `--op command` on a create-shaped command, `output_schema` could even be pre-filled with `{id}` plus whatever success fields the TODO already asks the author to confirm, since the scaffold's success branch returns `{ "id": res.id }` anyway.

---

Both are scaffold-completeness items rather than defects: a tool built from the current output is correct, it just declares less than the engine can enforce.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Fields named like *_type/*_kind/status carry a TODO to enum them or set them in the handler
- [ ] #2 The manifest template carries commented stubs for output_schema, annotations, audit_fields, title and idempotent
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
