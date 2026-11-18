---
id: TASK-15
title: Mirror the wrapped command's real validations in the generated input_schema
status: To Do
assignee: []
created_date: '2026-11-18 14:54'
labels:
  - pos-module-mcp
  - generator
  - validation
dependencies: []
references:
  - modules/mcp/generators/tool/index.js
  - modules/mcp/generators/tool/templates/manifest.liquid
priority: high
ordinal: 21000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Found while** scaffolding a real tool with `--op command --command modules/community/commands/posts/create` in an adopting app, then comparing the result with a hand-written tool wrapping the same command.

**Problem.** Field discovery reads the command's `build.liquid` and is accurate — it found `group_id, entity_id, parent_id, entity_type, title, body, embeded_media, date` and correctly dropped the system-set `uuid`. But the constraints it emits are generic defaults, not the command's real ones, even though they sit in `check.liquid` next to the file it already parses.

Generated:

```json
{"required":["group_id"],"properties":{
  "title":{"type":"string","maxLength":255},
  "body":{"type":"string","maxLength":255}, ...}}
```

`modules/community/commands/posts/create/check.liquid` actually enforces:

- `title` length minimum 3, **maximum 130**
- `body` presence, length minimum 3
- presence of `uuid`, `creator_id`, `group_id`, `entity_type`

So the draft is wrong in both directions:

- **Too tight where it matters.** `maxLength: 255` on `body` would reject any post longer than a paragraph. A post body is a `text` column with no such limit; the hand-written tool used 4000. An adopter who keeps the default ships a tool that refuses legitimate input, and the failure looks like an agent mistake.
- **Too loose where it matters.** `required` lists only `group_id`. `body` and `entity_type` are required by the command, so the agent learns that only after a 422 round trip — exactly the feedback the manifest is supposed to give up front.
- **`title` gets 255 where the command says 130**, so the agent is told it may write a title the command will reject.

**Why it is worth fixing.** The generator already locates the command directory to parse `build.liquid`. `check.liquid` is a sibling, and the validation calls it contains are a small, regular vocabulary: `validations/presence` (→ `required`), `validations/length` with `minimum`/`maximum` (→ `minLength`/`maxLength`), `validations/included` with an array (→ `enum`). Reading those would make the draft mirror the command instead of guessing, which is the generator's whole premise in command mode.

**Suggested change.** Parse the sibling `check.liquid` the same way `build.liquid` is parsed and map the common validators onto schema keywords. Where a field has no validation, keep today's default but mark it in the TODO list as unverified rather than presenting a specific number that looks derived. If parsing fails, fall back to current behaviour and say so in the run output.

**Secondary effect.** The module's own static linter (`tests/lib/lint-tools.mjs`) flags the generated draft with `weak-id` on three id fields and `unconstrained-display` on `title` and `body`. Those warnings are produced by the generator's own output, so tightening inference also stops the toolchain contradicting itself.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 required reflects the presence validations of the wrapped command
- [ ] #2 minLength/maxLength/enum are taken from the command's check.liquid where present
- [ ] #3 Fields with no discoverable validation are flagged as unverified rather than given an invented bound
- [ ] #4 A draft scaffolded from a community command no longer trips the static linter's weak-id and unconstrained-display checks on fields the command constrains
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
