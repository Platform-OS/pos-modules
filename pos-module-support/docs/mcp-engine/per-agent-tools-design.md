# Per-agent tool switches, and an agents API — design

For TASK-57. Written before the code, because this is a security boundary in a
shared engine: a mistake here hands an assistant a tool its person switched off.

Implemented in this repo's `modules/mcp` (the master development copy) and
ported to pos-module-mcp afterwards — see this directory's README.

## The gap

The engine narrows the served tool set with `mcp_token.allowed_tools`, which is
**per token**. One assistant normally holds several tokens: an OAuth client gets
a fresh access token on every refresh, and the row rotates. A choice stored on a
token therefore does not survive a refresh, so it cannot express "this
assistant may not reply to customers".

The switch has to follow the **agent**.

## What identifies an agent

`resolve_principal` already derives it:

```
agent_id          = token.label    || principal_id          # principal_id = "user:" + user_id
agent.client_id   = token.client_id || agent_id
```

So: the OAuth `client_id` when there is one (stable across refreshes — exactly
what we need), otherwise the token's label, otherwise the person themselves.

Consequences, accepted deliberately:

- **Two manual tokens with the same label are one assistant.** They share a
  switch set. That is the useful reading: a person who mints a second key for
  "Claude Desktop" means the same assistant.
- **An unlabelled manual token keys on `user:<id>`**, i.e. the person. A switch
  set then applies to all their unlabelled tokens. `/mcp-tools` asks for a
  label, so this is an edge case, not the normal path.

This derivation is currently inline in `resolve_principal`. It moves to
`helpers/identity/agent_key` so there is **one** definition. The panel groups
tokens with it and the call path checks with it, so the key written and the key
read cannot drift — the failure that would silently disable enforcement.

## Storage

New table `mcp_agent_setting`: `user_id`, `client_id`, `disabled_tools` (array).

- Keyed by **user_id and client_id together**, never client_id alone: two people
  may both label a key "Claude", and one must not configure the other's.
- `user_id` and `client_id` are untyped (string), matching `mcp_token`, and
  `disabled_tools` is a new array property. platformOS resolves a property's
  type by name across every schema, so a name reused with a different type
  silently corrupts both — checked, and there is no clash.
- A row exists only once someone changes something. No row means every tool the
  person's own access allows.

### Why store what is OFF, not what is ON

A tool added to the desk later is **on** until someone switches it off.

The alternative — storing the permitted set — means every tool added after the
choice was made silently vanishes from every existing assistant, with nothing in
any log to explain it. That failure is invisible and arrives later; this one is
visible in the panel and arrives at once.

The cost is real and worth stating: a *new* tool reaches existing assistants
without anyone revisiting the panel. For a tool that writes, the approval gate is
what stands between that and a customer, which is why write tools declare
`requires_approval` and the gate is on by default.

## Where enforcement goes

There are **three** execution paths and two listing paths, and they are not one
chokepoint. Each is handled, and the rule for the listings is deliberate.

| path | how | why |
|---|---|---|
| `tools/call` → `registry/resolve_tool` | narrowed | the inline execution boundary |
| `execute/invoke` → `registry/resolve_tool` | narrowed | in-process calls, same boundary |
| `approval/execute` → `identity/token_still_authorized` | narrowed | runs when an operator approves, possibly days later. `approval/execute` calls `resolve_tool` with `allowed_tools: null` on purpose, because the credential re-check is where narrowing already lives — so the new check goes there too |
| `registry/for_agent` | narrowed | already per agent by definition |
| `rpc/tools_list`, scope `principal` | narrowed | already caller-specific, and already hinted `private` |
| `rpc/tools_list`, scope `open` | **unchanged** | see below |

**The open list is left alone on purpose.** In `open` scope `route` sends the
client a `public` cache hint — "identical for everyone". Narrowing that response
per agent would make the hint a lie, and a client or proxy could cache one
assistant's narrowed list and serve it to another. The list stays the full
registry, execution still refuses, and a desk that wants discovery to match the
switches sets the existing `tools_list_scope: principal`, where the hint is
already `private`. No new knob, and no cacheable response that varies by caller.

A switched-off tool is reported exactly as `allowed_tools` reports one today —
not found, `-32602 Unknown tool` — rather than announcing that the tool exists
but is forbidden. Least disclosure, and consistent with the narrowing that is
already there.

## How it composes with `allowed_tools`

Both are restrictions, and restrictions accumulate:

```
effective = registry ∩ (token.allowed_tools, when non-empty) − agent.disabled_tools
```

Neither can widen the other. A tool a token allows but the person switched off
for that assistant is refused; this is asserted by a test, because "allowed by
the token" is exactly the case someone would expect to win.

## Lifecycle: revoke, then reconnect

Revoking an assistant **keeps** its switches.

Memo Vault clears them, so a reconnected assistant starts with every tool on.
The opposite choice is made here: silently widening access is the worse failure.
Someone who restricted an assistant, revoked it and connected it again under the
same name gets the restrictions back, and the panel shows them, so the surprise
is visible and one click from being undone. The rows are three short strings;
there is no sweep, because a sweep is exactly what would throw away the choice
we are keeping.

A future panel can offer "forget this assistant" to clear a row outright. Until
then nothing deletes one, which is the safe direction.

## The agents API

What an app needs to build a panel, and what it should not have to do for
itself — grouping tokens into assistants and revoking every token of one are
engine concerns, not something each app re-derives from the token table:

| operation | shape |
|---|---|
| `queries/agents/for_user` | the person's assistants, grouped by agent key: `{ client_id, name, kind, tokens, last_used_at, status, disabled_tools }` |
| `commands/agents/set_tools` | takes the tools that should be **on** (what a panel's checkboxes give) and stores the complement, validating every name against the registry so a typo cannot silently disable nothing |
| `commands/agents/revoke` | revokes every active token of one assistant |
| `commands/tokens/mint` | already exists — connecting an assistant |

Every operation takes the acting `user_id` and scopes by it. None accepts a bare
`client_id`, so one person's call can never reach another's assistant.

`disabled_tools` is read on every call, and once per tool in a principal-scoped
listing, so it is memoised per request in `context.exports` and the memo is
cleared by `set_tools` — the pattern the engine already uses for config and the
registry.
