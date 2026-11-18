# Connecting AI assistants to the Support Desk — implementation notes

Companion to `mcp-tools-proposal.md`. The proposal says what we ship and why; this says how
it is built. Read the proposal first — this assumes its decisions.

Written against **pos-module-mcp 0.2.x**. Where a detail comes from the engine, the engine
file is named so it can be re-checked rather than trusted.

- [What the engine gives us](#what-the-engine-gives-us)
- [Where the files live](#where-the-files-live)
- [The app shim, and why a module needs one](#the-app-shim-and-why-a-module-needs-one)
- [Identity: from a bearer token to a team member](#identity-from-a-bearer-token-to-a-team-member)
- [Reading: never write a new unscoped query](#reading-never-write-a-new-unscoped-query)
- [Writing: how the approval gate behaves](#writing-how-the-approval-gate-behaves)
- [Tool naming](#tool-naming)
- [Dependency posture](#dependency-posture)
- [The Agents panel](#the-agents-panel)
- [platformOS gotchas that bite here](#platformos-gotchas-that-bite-here)
- [File inventory and build order](#file-inventory-and-build-order)

---

## What the engine gives us

pos-module-mcp runs this pipeline for every `tools/call`, before our code sees anything:

```
authenticate → rate-limit → resolve tool → validate arguments → authorize → HANDLER → attest → respond
```

So a handler can trust that the caller holds a valid, unrevoked token bound to a real
platformOS user, that the arguments match the tool's declared `input_schema` exactly, and
that the tool's named authorization policy returned an explicit allow. Everything the
handler does afterwards is written to a tamper-evident ledger, pass or fail.

What the engine does **not** do, and we therefore must:

- decide whether this particular person may see this particular ticket;
- keep agents inside the department scope the desk already enforces;
- decide which actions are proposals rather than actions.

---

## Where the files live

Logic lives under `lib/`, which platformOS resolves like `views/partials`. A module's
`modules/support/public/lib/x/y.liquid` is addressed as `modules/support/x/y`.

```
modules/support/public/lib/mcp/
  registry.liquid                      → modules/support/mcp/registry
  instructions.liquid                  → modules/support/mcp/instructions
  helpers/actor.liquid                 → modules/support/mcp/helpers/actor
  policies/desk_read.liquid            → modules/support/mcp/policies/desk_read
  policies/desk_write.liquid           → modules/support/mcp/policies/desk_write
  tools/<name>/manifest.liquid         → modules/support/mcp/tools/<name>/manifest
  tools/<name>/call.liquid             → modules/support/mcp/tools/<name>/call
```

A tool is exactly two files: a manifest (what the agent is told, and what the engine
validates) and a handler (the work). Any GraphQL a handler needs is an ordinary module
query under `modules/support/public/graphql/`, reached through the existing query wrappers.

---

## The app shim, and why a module needs one

The engine reads three things from **fixed app paths**, not from modules
(`modules/mcp/public/lib/helpers/config.liquid`):

| what | config key | resolves to |
|---|---|---|
| the tool registry | `registry_partial: 'mcp/registry'` | `app/lib/mcp/registry.liquid` |
| an authorization policy | `policy_prefix: 'mcp/policies'` | `app/lib/mcp/policies/<name>.liquid` |
| the connection instructions | `instructions_partial: 'mcp/instructions'` | `app/lib/mcp/instructions.liquid` |

Both keys are single-valued and overridable only through the `MCP_CONFIG` constant, so
pointing `policy_prefix` at the support module would take the app's own policies away.
A module therefore cannot register its own tools. The host app must opt in, with three
small files that delegate:

```liquid
{% comment %} app/lib/mcp/registry.liquid {% endcomment %}
{% liquid
  assign tools = []
  function support = 'modules/support/mcp/registry'
  assign tools = tools | concat: support
  return tools
%}
```

```liquid
{% comment %} app/lib/mcp/policies/support_desk_read.liquid {% endcomment %}
{% liquid
  function decision = 'modules/support/mcp/policies/desk_read', principal: principal, agent: agent, arguments: arguments, tool: tool, delegation_mode: delegation_mode
  return decision
%}
```

This is a feature, not a workaround: every tool an instance serves is named in one
reviewed app file. A module dropping files on disk can never put a tool in front of an
agent by itself.

**Registry entries use the module path** — `{ "name": "support_search_tickets", "path":
"modules/support/mcp/tools/support_search_tickets" }`. The engine appends `/manifest` to
`path` and calls it as a partial (`modules/mcp/public/lib/queries/registry/build.liquid`),
so a module path works unchanged.

The shim is three files plus one per policy. It should be written by the install
generator (`modules/support/generators/install`), not pasted by hand — the generator
already writes app-side files such as `app/lib/hooks/hook_support_branding.liquid`, and
already skips what is there — TASK-49.

---

## Identity: from a bearer token to a team member

The engine hands the handler `principal` = `{ id, user_id }` — a real platformOS user, not
a desk identity. The chain from there, implemented once in
`modules/support/mcp/helpers/actor`:

```
principal.user_id
  → modules/user/queries/profiles/find (user_id:)     the profile
  → modules/support/queries/team_members/find         the desk membership
  → member.state == 'active'                          or nothing
  → modules/support/can/desk                          per-permission check
```

Two rules that are deliberate and worth defending in review:

**1. MCP never provisions desk access.** The desk's own gate
(`modules/support/helpers/resolve_member`) *creates* a team member on first visit for a
host superadmin, a mapped host role, or an `ADMIN_EMAILS` address. The MCP path must not
call it. It uses `queries/team_members/find` only, so an assistant can act only for
someone who already has a membership record. A superadmin who has never opened the desk
gets a clean denial and opens `/support-desk` once. Auto-provisioning triggered by an API
token is the wrong default.

**2. Authorization is the desk's, not a second copy.** `modules/support/can/desk` is where
role and department scope are decided for every page. Policies and handlers call it with
the same `{ member, ticket }` entity the pages pass. If the rule changes there, it changes
for agents in the same commit.

The policy partial decides *who may call the tool*; the handler decides *whether this
caller may touch the named record*, because that depends on the arguments. Both are
needed — a policy that passes is not a licence to read any ticket id.

---

## Reading: never write a new unscoped query

`modules/support/queries/tickets/scope` turns a member into the department ids they may
read: their own for an agent, everything for a manager or admin. Every existing query
wrapper already applies it.

So the read tools wrap the wrappers:

| tool | wraps |
|---|---|
| `support_search_tickets` | `modules/support/queries/tickets/search` |
| `support_read_ticket` | `modules/support/queries/tickets/find` + `modules/support/messages/search` |
| `support_find_customer` | `modules/support/queries/contacts/page_data` |
| `support_queue_overview` | `modules/support/queries/tickets/counts` |
| `support_saved_replies` | `modules/support/saved_replies/search` |

A handler that writes its own `records(...)` filter re-implements the scope rule and will
eventually disagree with the desk. The only reason to add GraphQL under
`app/graphql/mcp/` or the module's `graphql/` directory is a shape no wrapper produces —
and then the wrapper is the better place to add it.

Note the field selection: `modules/support/tickets/search.graphql` returns ~35 properties
per ticket, most of which an assistant has no use for (SLA bookkeeping, merge pointers,
delivery state). The handlers project a small, named result and declare it in
`output_schema`. Returning the raw record would leak internal fields into model context
and make every later field rename a breaking change for agents.

---

## Writing: how the approval gate behaves

Set `requires_approval: true` in the manifest. Then, from
`modules/mcp/public/lib/commands/rpc/tools_call.liquid`:

- the handler **never runs inline** — there is no "approve quickly" path;
- the validated arguments are stored, an opaque handle is returned, and the ledger records
  `pending_approval`;
- an operator approves in `/mcp-admin`, and the handler executes **then**, as the original
  principal, not as the operator;
- the agent polls the built-in `mcp_approval_status` tool with the handle.

Limits that already exist and that we should not re-invent: at most **3** non-expired
pending proposals per principal (`approval_max_pending_per_principal`), identical proposals
deduplicated by a hash of the arguments, and a **7-day** expiry
(`approval_window_seconds`). Both are `MCP_CONFIG` keys.

Consequences for the desk:

- A write handler must be safe to run **later**. The ticket may have moved on between the
  proposal and the approval. Re-check the ticket and the member's scope inside the handler;
  do not trust the state the arguments were written against.
- Approval happens in the MCP admin console today. The proposal argues it belongs in the
  desk; that is a real piece of work (a desk page over `modules/mcp` approval records, plus
  a permission), not a configuration switch.
- The person who approves is not necessarily the person the action runs as. Both are in the
  ledger. If the desk grows its own approval screen, it must show both.

---

## Tool naming

Tool names are global to the instance's registry. These tools ship from a module into a
host app that may already serve its own, so every name carries the `support_` prefix.
`mcp_` is reserved by the engine and rejected at registration.

The prefix is not clutter for the model: the description is where clarity lives, and MCP
clients commonly show tool names unqualified alongside tools from other servers.

---

## Dependency posture

**pos-module-mcp is not a dependency of pos-module-support.** The MCP files call only
support's own queries and the user module; nothing in them references `modules/mcp`. On a
desk without the MCP module installed they are inert files that nothing loads.

They become live only when an app installs pos-module-mcp *and* writes the shim. That is
the "optional integration, off unless a desk turns it on" answer from the proposal,
achieved by construction rather than by a feature flag.

The MCP module belongs in `devDependencies` so the module's own host app can run the tools
in tests.

---

## The Agents panel

Memo Vault's `/agents` is the model (`pos-memory/app/views/pages/agents/`). What it
actually does, and what we would need:

| memo vault | mechanism |
|---|---|
| connect an assistant | `modules/mcp/commands/tokens/mint` — returns the raw token once, stores only its digest |
| list the person's assistants | its own query over the person's MCP tokens, grouped by OAuth `client_id` or token label |
| revoke | `modules/mcp/commands/tokens/revoke` for every token making up that assistant |
| per-assistant tool switches | its **own** table, enforced by its **own** authorization policy |

That last row is the one to copy carefully. The engine has a per-token `allowed_tools`
narrowing, but one assistant is usually several tokens (an OAuth client refreshes), so memo
vault keeps the switch against the person + client id and enforces it in the policy
partial. Our `support_desk_*` policies would do the same check.

The panel is gated on the MCP module's `mcp.tokens.manage` permission, which is separate
from the desk's own roles. A desk that installs MCP has to grant it. Worth deciding
whether the desk's `admin` role implies it.

---

## platformOS gotchas that bite here

- `{% graphql %}` must appear **above** every use of its result. Referencing it earlier
  renders blank with no error.
- Guard non-null query variables **before** the tag. A missing variable 500s the request
  rather than returning nothing.
- Build a hash **inside** a loop. A hash assigned once before the loop is shared by
  reference and every row ends up identical — the classic way a list of tickets comes back
  as the same ticket N times.
- Array filters return a new value: `assign list = list | array_add: item`.
- A filter used in a tag *argument* is silently dropped and still deploys. Assign first.
- The manifest's `input_schema` may nest 5 levels, `output_schema` 8
  (`max_schema_depth`, `max_output_schema_depth`).
- Manifest text is model-read and lint-checked at registration. A manifest that fails
  validation is **excluded** from the registry and logged — the tool simply is not there,
  which looks identical to forgetting to register it. Check
  `/mcp-admin` or the `mcp.registry_excluded_manifest` log before debugging anything else.

---

## File inventory and build order

Step 1 — reading, end to end:

```
modules/support/public/lib/mcp/helpers/actor.liquid
modules/support/public/lib/mcp/policies/desk_read.liquid
modules/support/public/lib/mcp/registry.liquid
modules/support/public/lib/mcp/instructions.liquid
modules/support/public/lib/mcp/tools/support_search_tickets/{manifest,call}.liquid
modules/support/public/lib/mcp/tools/support_read_ticket/{manifest,call}.liquid
modules/support/public/lib/mcp/tools/support_find_customer/{manifest,call}.liquid
modules/support/public/lib/mcp/tools/support_queue_overview/{manifest,call}.liquid
modules/support/public/lib/mcp/tools/support_saved_replies/{manifest,call}.liquid
app/lib/mcp/registry.liquid                      (host app shim, reference copy)
app/lib/mcp/policies/support_desk_read.liquid
app/lib/mcp/instructions.liquid
app/lib/test/support/mcp_tools_test.liquid
```

Step 2 — the Agents panel, so people can connect and revoke without the MCP console.

Step 3 — internal notes: the first write, and the only one where a wrong result is cheap.
Adds `policies/desk_write.liquid` and the approval round trip.

Step 4 — triage writes (priority, status, snooze, assign), then customer replies.

Each step is deployable and useful on its own.

Tracked as TASK-48 (read tools), TASK-49 (generator writes the shim), TASK-50 (Agents
panel), TASK-51 (internal note), TASK-52 (triage writes), TASK-53 (customer reply) and
TASK-54 (approvals in the desk).
