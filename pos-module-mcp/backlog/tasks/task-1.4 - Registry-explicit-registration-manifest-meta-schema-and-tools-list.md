---
id: TASK-1.4
title: 'Registry — explicit registration, manifest meta-schema, tools/list'
status: Done
assignee: []
created_date: '2026-07-23'
updated_date: '2026-07-23'
labels:
  - pos-module-mcp
  - registry
dependencies:
  - TASK-1.2
parent_task_id: TASK-1
priority: high
ordinal: 1040
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Tool + resource discovery (spec §7, §8, §14.3). Registration is CODE not data by
default (§4.2): a tool is served only if explicitly registered in the app's
`pos-module.json` mcp block (§8.2) AND its `app/mcp/tools/<name>/manifest.yml`
passes the manifest meta-schema. Presence of a directory is necessary but not
sufficient. `views/partials/registry/{discover_tools,discover_resources,
resolve_tool}.liquid` + `lib/queries/tools/find_by_name.liquid`.

Manifest meta-schema validation (§7.2) is strict: every field's semantics
enforced; a tool with no `authorization_policy` is INVALID and excluded
(no-implicit-allow, §12.2); unsupported JSON-Schema keywords in `input_schema`
reject the manifest at load (§10.1). Invalid manifests are excluded AND logged,
never served degraded (§8.1). `tools/list` supports cursor pagination from v1
(§14.3), includes `version` and a `deprecated` flag with sunset date. Registry
is built once and cached, keyed by a deploy identifier so a deploy invalidates
it (§17.2 — confirm the cache primitive). Dynamic registry (`mcp_tool_registration`,
§8.3) is OUT of Phase 1 (config-off default) — leave the seam, don't build it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Served only when explicitly registered (app registry partial [{name,path}]) AND manifest passes meta-schema. Registered-but-missing manifest → excluded+logged; manifest-name ≠ registered-name → excluded (identity guard). VERIFIED live (tools/list shows exactly search_events). Registration is via the app registry partial, not pos-module.json (not runtime-readable — decision-1).
- [x] #2 No authorization_policy → invalid (no implicit allow); unsupported schema keyword (oneOf) → rejected at load; bad name → rejected. VERIFIED via validation matrix.
- [x] #3 tools/list returns name/description/inputSchema + _meta{version,deprecated}; cursor pagination (base64 offset, nextCursor when total>page). VERIFIED live shape.
- [x] #4 Deprecated tools remain listed and get a sunset notice appended to description + _meta.deprecated=true (§14.2).
- [~] #5 Registry accessor (registry/load) is the single cache seam; {% cache %} (auto-invalidates on deploy) is the documented mechanism. Left UNCACHED for now (small registry, within budget) to avoid stale/escaping edge cases before the suite locks behavior — one-line wrap when profiling warrants (§17.3).
- [x] #6 Per-token allowed_tools intersects the served set (resolve_tool: absent-from-nonempty-allowed → not found). effective = registered ∩ allowed_tools ∩ authz (authz in 1.6).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:IMPL:BEGIN -->
LAYER-2 TOOL STRUCTURE (per user direction + spec §5.2): each tool is a self-
contained dir app/views/partials/mcp/tools/<name>/ with `manifest` (declaration)
and `call` (handler, added in 1.8), referenced logically as `mcp/tools/<name>`.
The app registry partial (app/views/partials/mcp/registry.liquid) returns the
EXPLICIT [{name, path}] list — a tool exists to agents only if listed (§8.2). No
broken fixtures shipped in app code; exclusion is proven by unit tests against the
validator. PLATFORM CONSTRAINT: partials resolve under views/partials, so physical
path is app/views/partials/mcp/tools (logical `mcp/tools`) — closest platformOS
allows to a literal app/mcp/tools.

Engine files (modules/mcp/public/lib/commands): registry/{build,load,resolve_tool,
manifest_schema,validate_schema_node,lint_description}.liquid; rpc/tools_list.liquid;
resolve wired into rpc/tools_call + rpc/dispatch.

platformOS LESSONS: `type_of` returns CAPITALIZED ('Boolean'/'Integer'/'Array') →
downcase before comparing. Filter precedence: `arr | array_add: x | append: y`
parses as `(arr|array_add:x)|append:y` and STRINGIFIES the array — always build the
message string first, then array_add. `matches` (regex→bool) and `hash_keys`/
`array_include` used for name/SemVer + unknown-keyword detection. `''` apostrophe-
escaping does NOT work in Liquid strings. Inert-but-armed VERIFIED: no registry
partial → tools/list returns [] (missing-partial caught), not 500.
<!-- SECTION:IMPL:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Meta-schema + pagination + exclusion tests written and passing
- [ ] #2 platformos-check lint passes with zero errors
- [ ] #3 Docs updated (docs/authoring-tools.md + spec §7/§8 cross-ref)
- [ ] #4 Deployed to staging with ≥1 community-declared read tool visible in tools/list
- [ ] #5 Security invariants verified — no implicit allow; invalid manifests never served
- [ ] #6 Reviewed before merge
<!-- DOD:END -->
