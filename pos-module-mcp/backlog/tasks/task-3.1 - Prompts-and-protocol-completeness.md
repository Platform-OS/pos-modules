---
id: TASK-3.1
title: 'Prompts (prompts/list, prompts/get) + protocol completeness'
status: Done
assignee: []
created_date: '2026-07-23'
updated_date: '2026-07-23'
labels:
  - pos-module-mcp
  - phase-3
  - prompts
dependencies:
  - TASK-1.8
parent_task_id: TASK-3
priority: medium
ordinal: 3100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The next protocol surface after tools and resources (spec §13.1): MCP prompts —
reusable, parameterized prompt templates the server offers to agents. Same
Layer-1/Layer-2 pattern: the app authors prompts (name, description, arguments,
template); the engine validates and serves them via prompts/list and renders them
via prompts/get. Also completes two trivial protocol methods:
resources/templates/list and logging/setLevel.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 prompts/list returns registered prompts (name/title/description/arguments) in MCP shape. VERIFIED live (draft_announcement).
- [x] #2 prompts/get resolves by name, renders the template with arguments, returns { description, messages }. VERIFIED live (clean interpolation, no HTML-escaping).
- [x] #3 Missing required argument → -32602 "Missing required arguments: …"; unknown prompt → -32602. VERIFIED live.
- [x] #4 initialize advertises prompts + logging capabilities. VERIFIED live.
- [x] #5 resources/templates/list → empty resourceTemplates; logging/setLevel → acknowledged no-op. VERIFIED live.
- [x] #6 Prompt registry validated (name pattern, description, template, arguments-array); invalid prompts excluded + logged. No regression (conformance 35/35 after dispatch changes).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:IMPL:BEGIN -->
Files: config.prompts_partial (default 'mcp/prompts'); registry/build_prompts (mirror
of registry/build, lighter — no authz/input-schema since prompts have no side
effects); rpc/{prompts_list,prompts_get}; dispatch routes prompts/list (open),
prompts/get (result|_error), resources/templates/list (empty), logging/setLevel
(ack); initialize capabilities += prompts,logging. Layer-2 demo: app/views/partials/
mcp/prompts.liquid + mcp/prompts/draft_announcement.liquid.

Prompts are OPEN (discovery + template rendering, no side effects, no identity) —
consistent with tools/list. prompts_get template returns a string (→ one user
message) OR a messages array. KEY: template interpolates via `append`, NOT {{ }},
to avoid output HTML-escaping of argument values (verified clean over HTTP).
<!-- SECTION:IMPL:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 prompts/list + prompts/get + error cases verified live
- [x] #2 platformos-check passes (deploy succeeded)
- [x] #3 No regression — conformance suite 35/35 after dispatch changes
- [ ] #4 Remaining Phase 3: eval harness (§19.3), dev-time scaffolder (§8.4), richer admin (registry/client views)
<!-- DOD:END -->
