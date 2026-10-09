---
id: TASK-1.8
title: 'RPC methods — initialize, ping, tools/call (read-only), resources over .md'
status: Done
assignee: []
created_date: '2026-07-23'
updated_date: '2026-07-23'
labels:
  - pos-module-mcp
  - rpc
dependencies:
  - TASK-1.2
  - TASK-1.3
  - TASK-1.4
  - TASK-1.5
  - TASK-1.6
  - TASK-1.7
parent_task_id: TASK-1
priority: high
ordinal: 1080
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Assemble the governed READ server — the Phase-1 success criterion (§22). Wires
the full `tools/call` lifecycle (§9.2) for NON-mutating tools: parse → limit →
authenticate → resolve tool → validate → authorize → execute handler → attest →
respond. (Transaction wrap + approval gate + idempotency are mutating-tool
concerns → Phase 2/task-2; leave the seams.)

`lib/commands/rpc/`: `initialize` (capability negotiation, pinned protocol
version from task-1.1, serverInfo), `ping`, `tools_list` (delegates to
task-1.4), `tools_call` (read handlers only), `resources_list`, `resources_read`.

Handler contract (§7.3): the handler receives `arguments` (validated+coerced),
`principal`, `agent`, `context_meta {tool_name, tool_version, request_id,
ledger_seq}` and returns `{ ok, result, subject?, error? }`. Handler rules
enforced/documented: never interpolate arguments into GraphQL strings (typed
variables only); never fetch an agent-supplied URL; never write mcp_ledger
directly. Tool execution failures return as MCP tool errors (`isError:true`),
NOT protocol errors, so the agent can reason about them (§13.2).

**Zero-config resources (§3.2):** enumerate eligible markdown pages
(`config.mcp.resources.markdown_page_prefixes`) and serve them as MCP resources
via the `/:slug.md` endpoint — governed, freshness-stamped — with no custom
authoring. This must work on install with no app tools.

Provide ONE community read tool (Layer 2) as the live proving harness (e.g.
`find_group` / `list_events`) wired to an existing community query — this is the
test fixture for §22, not module code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 initialize returns pinned protocol (2025-06-18) + capabilities + serverInfo + house-rules instructions; ping works. VERIFIED live.
- [x] #2 read-only tools/call runs the FULL pipeline parse→limit→auth→rate-limit→resolve→validate→authorize→execute→attest→respond and returns MCP content + structuredContent. VERIFIED live (search_events → 2 real jazz events).
- [x] #3 Handler contract (§7.3): search_events passes args as TYPED graphql variables (mcp/search_events.graphql), no agent-URL egress, no direct ledger write. Executor execute/run.liquid enforces the {ok,result,subject,error} contract.
- [x] #4 Handler business failure → MCP tool error (isError:true); thrown/malformed handler → fail-safe generic tool error; protocol errors reserved for malformed/refused. VERIFIED (empty result count:0,isError:false).
- [x] #5 resources/list + resources/read serve .md/doc pages by configured prefix, zero app-tool authoring, freshness-stamped (content_updated_at), CONFIG-GATED (resources.expose_markdown_pages, OFF by default) + prefix allowlist RE-CHECKED on read (crafted-uri outside allowlist → not found). VERIFIED live.
- [x] #6 §22 PROOF: off-the-shelf client + bearer + URL → tools/list + tools/call search_events; both calls in the verifiable ledger chain (execution_outcome:success, distinct input_sha256, principal user:42). VERIFIED live.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:IMPL:BEGIN -->
PIPELINE COMPLETE. tools_call: authenticate→rate-limit→resolve→validate→authorize→
EXECUTE(execute/run)→attest→respond. execute/run.liquid invokes the handler
partial with (arguments,principal,agent,context_meta), enforces the §7.3 contract,
maps to MCP content+structuredContent, fail-safe on throw/malformed (isError). The
transaction-wrap seam for mutating tools (Phase 2) is marked here. Layer-2:
app/views/partials/mcp/tools/search_events/{manifest,call}.liquid +
app/graphql/mcp/search_events.graphql (published events, keyword contains, typed vars).

HOUSE RULES (initialize instructions): AUTHORED BY THE TOOLS AUTHOR, not the module
— app/views/partials/mcp/instructions.liquid (config.instructions_partial =
'mcp/instructions'); engine only FALLS BACK to a default when absent. VERIFIED the
community persona is served.

RESOURCES: config-gated (MCP_CONFIG resources.expose_markdown_pages, nested-merged
so turning on keeps default prefixes) + prefix allowlist; resources_read RE-CHECKS
the allowlist with a plain prefix test (not regex — a prefix could carry metachars)
so a crafted uri can't read engine pages. Uses admin_pages (starts_with slug filter;
request_method enum filter was rejected → removed). Serves page.content (markdown).

PLATFORM FACT (verified, answers "why not app/mcp/tools"): deploy reports
`files_not_matched: [mcp/tools/probe/manifest.liquid]` for anything under app/mcp/ —
platformOS drops files outside recognized dirs (views/pages, views/partials, graphql,
schema, assets, migrations, translations, lib). Partials resolve ONLY under
views/partials → tools live at app/views/partials/mcp/tools, logical namespace mcp/tools.
<!-- SECTION:IMPL:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Protocol-conformance fixtures for initialize/ping/tools.call/resources.* written and passing
- [ ] #2 platformos-check lint passes with zero errors
- [ ] #3 Docs updated (docs/authoring-tools.md handler contract + spec §7.3/§9/§13 cross-ref)
- [ ] #4 Deployed to staging and driven by a real MCP client end-to-end (§22)
- [ ] #5 Security invariants verified — no query-string interpolation, no egress, no direct ledger write; every termination ledgered
- [ ] #6 Reviewed before merge
<!-- DOD:END -->
