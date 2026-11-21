# Engine changes waiting to be ported to pos-module-mcp

The MCP module in this repo's `modules/` is a **development copy taken from
pos-module-mcp master**, not the published 0.2.1 that `pos-module.lock.json`
names. Features the desk needs are written there first and ported to
pos-module-mcp afterwards.

`modules/` is gitignored here, so those edits are **not version controlled**.
`engine-changes.patch` is the durable record of them. Two things will silently
throw the working copy away:

- `pos-cli modules install` (with or without `--dev`) replaces `modules/mcp`
  with the published release;
- a fresh clone of this repo has no `modules/mcp` at all.

So port promptly, and re-apply the patch after any module install.

## engine-changes.patch

One patch, 20 files, carrying **both** features below. They are not split into
two patches because three files (`helpers/config`, `rpc/tools_call`,
`execute/invoke`) are touched by both, and two overlapping patches would
conflict depending on the order they were applied.

Taken against pos-module-mcp **master** as of the copy in this repo, and
verified to apply to a pristine master tree:

```bash
cd pos-module-mcp
patch -p1 --directory=modules/mcp --dry-run < \
  ../pos-module-support/docs/mcp-engine/engine-changes.patch
```

Drop `--dry-run` to apply. Check the hunks if master has moved on. Neither
feature's README, CHANGELOG or spec entry is in the patch — those are written
when porting.

### If part of this has already been ported

The patch is **cumulative against master**, not against a branch that already
carries some of it. Features 1 and 2 below were ported to the pos-module-mcp
branch `mcp-module-improvements` first; the per-tool addition to feature 1 came
afterwards, so applying this whole patch on top of that branch conflicts.

To see what a branch is actually missing, diff it rather than trusting the
patch:

```bash
cd pos-module-mcp && git archive <branch> modules/mcp | tar -x -C /tmp/ported
diff -ruN /tmp/ported/modules/mcp ../pos-module-support/modules/mcp
```

As of this writing `mcp-module-improvements` is missing only the per-tool
change: `queries/approval/enforced` taking `tool_name` and the two call sites
(`rpc/tools_call`, `execute/invoke`) passing it. It is also one comment ahead of
the support copy in `graphql/tokens/find_by_id.graphql`, which is text only.

### 1. A switch for the approval gate, which an app can own

| file | change |
|---|---|
| `lib/helpers/config.liquid` | new keys `approval_enforced` (default `true`) and `approval_partial` (default `mcp/approval`) |
| `lib/queries/approval/enforced.liquid` | **new** — resolves the switch: the app's partial first, then the config key. Takes `tool_name` and passes it to the app's partial |
| `lib/commands/rpc/tools_call.liquid` | step 7a gates on it as well as on the manifest, passing the tool name |
| `lib/commands/execute/invoke.liquid` | same, for the in-process path |

Two ways to turn the gate off. An operator sets the constant:

```bash
pos-cli constants set <env> --name MCP_CONFIG --value '{"approval_enforced": false}'
```

Or the app answers for itself, which is what the support desk does:
`app/lib/mcp/approval.liquid` returns `{ enforced: boolean }` from the desk's own
setting, so support admins flip it in the Assistants screen instead of anyone
editing an instance constant. The engine never reads an app's table, and the app
never rewrites the engine's config.

**The partial is asked about one tool, not about all of them.** The engine passes
`tool_name`, so an app can gate some tools and let others through — the desk lets
an admin turn approval off for, say, adding an internal note while a reply to a
customer still waits. An app that ignores the parameter keeps answering for every
tool at once, as before, so this is backwards compatible. A call with no
`tool_name` (nothing in the engine does this today) must be answered as "every
tool", never as an exemption: the desk's partial consults its exemption list only
when it was told which tool is being run.

The desk stores exemptions rather than the tools that need approval
(`mcp_approval_exempt_tools`), so a tool added to the desk later waits until an
admin says otherwise.

**Fail-safe in both directions.** Only an explicit `false` turns the gate off; a
missing partial, one that raises, and any other answer all leave it on.

A tool's declared `requires_approval` is untouched, so `tools/list` and the
manifest stay the truth about what a tool is; the switch only decides whether
the engine enforces the wait. **Only an explicit `false` disables it.**

Evaluated per request at the gate, deliberately not in a manifest or the
registry: the built registry is cached for up to five minutes, so a manifest
deciding this for itself would keep executing ungated for minutes after an
operator turned the gate back on.

Verified on `ps` over HTTP: gated → `pending_approval` (and `queue_full` at
three pending) with the ticket unchanged; `approval_enforced: false` → the same
call executed and the priority really changed; back to `{}` → gated again on the
next call, no redeploy.

### 2. Per-agent tool switches, and an agents API

Design and rationale: `per-agent-tools-design.md`. New table
`mcp_agent_setting`, `helpers/identity/agent_key`, `queries/agents/{tool_enabled,
for_user}`, `commands/agents/{set_tools,revoke}`, four `graphql/agents/`
operations; enforcement wired into `registry/resolve_tool`,
`identity/token_still_authorized`, `registry/for_agent` and
`rpc/tools_list` (principal scope only), with `identity/resolve_principal`
deriving the agent key through the shared helper.

Verified on `ps`: a switched-off tool answers `-32602 Unknown tool`; other tools
still work; the built-in `mcp_approval_status` cannot be switched off; another
person's `client_id` is `not_found`; an unknown tool name is rejected; the
principal-scoped list drops the tool while the open list does not.

**`tokens/find_by_id` gaining `label` is part of this patch and is
load-bearing.** Without it the agent key falls back to the person on the
approval path, matches no stored setting, and the switches silently stop being
enforced there. That was a real bug, found by probing that path separately — see
the design note. It is also the reason this feature needs a test before anyone
trusts it against regressions; there isn't one yet.
