---
id: TASK-3.5
title: 'Scaffolder — command-wrap mode (tool from an app command)'
status: Done
assignee: []
created_date: '2026-07-23'
updated_date: '2026-07-23'
labels:
  - pos-module-mcp
  - phase-3
  - scaffolder
parent_task_id: TASK-3
priority: medium
ordinal: 3500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extend the tool generator with a third mode, `--op command`, that scaffolds a tool
which WRAPS an existing application command (build→check→execute) instead of a raw
record_create. This is the production path: the tool inherits the command's
validations, relationships, and side-effects — the agent gets the same guardrails as
the app's own UI. Complements the table-based read/create modes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `--op command --command <path>` mode added; input_schema derived from the declared fields (like create); mutating:true default.
- [x] #2 Generates manifest + call.liquid, NO graphql (the command owns its queries). VERIFIED via template render.
- [x] #3 Handler builds an object from arguments, invokes the command, interprets the platformOS {valid, errors} contract → handler return {ok,result?,subject?,error?}; field errors surfaced under error.fields for agent self-correction.
- [x] #4 Clearly-marked TODOs for the 3 things only the author knows: arg→object-key mapping, identity param (profile from principal.user_id), success fields. Draft-safety unchanged (authorization_policy empty → excluded).
- [x] #4b FIELD AUTO-DISCOVERY (correcting the earlier "not introspectable" overstatement): command mode with no explicit fields parses the command's build.liquid for `object.<key>` accessors, filters system keys (id/uuid/*_uuid/c__*), infers types by name → pre-fills the schema. VERIFIED against events/create build → name/short_description/description/link/venue/start_date:datetime/end_date:datetime/commentable:boolean/status. Explicit name:type args override; missing build file → graceful fallback. It's a reviewed SUGGESTION (no formal command contract; types inferred, computed keys may be missed).
- [x] #5 Generator still discovered (pos-cli generate list) and deploys clean; read/create modes unaffected.
- [x] #6 Documented in README + docs/authoring-tools.md (mode table + when-to-use; command = recommended for non-trivial tools).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:IMPL:BEGIN -->
generators/tool/index.js: op now read|create|command; command adds --command option;
create+command share input_schema-from-fields; writing() routes command → call_command
.liquid + no graphql. New template call_command.liquid: builds `object` from
attributes, `function res = '<command>', object: object` (with commented profile-
resolution + identity-param TODO), interprets res.valid/res.errors, returns handler
contract with res.id as subject. Command contract learned from
modules/community/commands/events/create (build→check→core/commands/execute; returns
object.valid + record). Verified output by rendering templates. platformos-check
passes (deploy ok). NOTE: command arg-shape isn't introspectable (unlike tables), so
fields are author-supplied name:type and the arg→object mapping is a reviewed TODO.
<!-- SECTION:IMPL:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Command mode renders correct manifest + command-wrapping handler
- [x] #2 platformos-check passes; generator discovered
- [x] #3 Draft-safety preserved (empty policy → excluded)
- [x] #4 README + authoring guide updated with all three modes
<!-- DOD:END -->
