---
id: TASK-3.3
title: 'Dev-time tool scaffolder — native pos-cli generator'
status: Done
assignee: []
created_date: '2026-07-23'
updated_date: '2026-07-23'
labels:
  - pos-module-mcp
  - phase-3
  - scaffolder
dependencies:
  - TASK-1.4
parent_task_id: TASK-3
priority: medium
ordinal: 3300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The dev-time scaffolder (spec §8.4) — accelerates tool authoring by emitting a DRAFT
manifest + handler + query, which a human then constrains. Built the NATIVE
platformOS way: a `pos-cli generate` generator that ships in modules/mcp, discovered
alongside core's command/crud generators (no standalone-script workaround). Propose-
then-validate: the draft leaves authorization_policy empty, so it fails the meta-
schema and stays out of the registry until reviewed — it can never reach an agent
unreviewed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Native generator at modules/mcp/generators/tool/ (yeoman + templates), matching the core command/crud pattern. VERIFIED: `pos-cli generate list` shows `tool → modules/mcp/generators/tool`.
- [x] #2 Emits a draft tool for --op read | create from a table + fields (name:type): manifest + call + graphql into app/views/partials/mcp/tools/<name>/ and app/graphql/mcp/<name>.graphql. VERIFIED: templates render correct output (input_schema from fields, typed GraphQL variables, no interpolation).
- [x] #3 DRAFT SAFETY: manifest authorization_policy is EMPTY → fails the meta-schema → EXCLUDED from the registry. VERIFIED live (manifest_schema on the generated manifest → valid:false "authorization_policy: required").
- [x] #4 Never registers the tool (mcp/registry untouched); end() prints the review+register steps.
- [x] #5 Schema introspection available (admin_model_schemas returns fields + attribute_type; verified) — fields can also be passed explicitly (name:type), the native crud convention.
- [x] #6 Runtime dep (yeoman-generator) installed by pos-cli's interactive prompt — identical to core's generators; no core MODULE dependency and no bundled node_modules needed.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:IMPL:BEGIN -->
Files: modules/mcp/generators/tool/index.js (yeoman Generator: args toolName +
attributes[name:type], options --op/--table; builds input_schema + type maps in the
constructor; writing() copyTpl per op) + templates/{manifest.liquid, call_create.liquid,
call_read.liquid, create.graphql, read.graphql} (EJS: <%= %> interpolate, <% forEach %>
loops, <%- %> for the un-escaped input_schema JSON).

KEY FINDINGS: pos-cli command is `generate` (not `generators`): `pos-cli generate list`
/ `pos-cli generate run modules/mcp/generators/tool <name> <field:type…> --op --table`.
Generators are auto-discovered from modules/*/generators/ — no pos-module.json entry.
yeoman-generator is NOT bundled; pos-cli offers to install it on first run (core's
command/crud hit the exact same prompt) — so no core-module dependency is required for
a module to ship its own generator. Verified generated OUTPUT by rendering the EJS
templates directly (yeoman peer-dep install is a pos-cli interactive concern, not a
correctness one). Documented in docs/authoring-tools.md.
<!-- SECTION:IMPL:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Generator discovered by pos-cli generate list
- [x] #2 Generated draft output verified correct (manifest/handler/graphql)
- [x] #3 Draft-safety verified: empty policy → excluded from registry
- [x] #4 Documented in the authoring guide
- [x] #5 Native pattern, no standalone-script workaround
<!-- DOD:END -->
