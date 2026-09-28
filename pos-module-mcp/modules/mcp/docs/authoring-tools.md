# Authoring tools — developer guide

How to add a tool that an agent can call through the governed MCP endpoint. Tools
are **Layer 2**: they live in the app, reference the app's own commands/queries, and
carry all business meaning. The engine (Layer 1) authenticates, rate-limits,
resolves, validates, authorizes, executes, and attests every call — your tool only
does the work.

- [Mental model](#mental-model)
- [Anatomy of a tool](#anatomy-of-a-tool)
- [Walkthrough: a read tool end to end](#walkthrough-a-read-tool-end-to-end)
- [Manifest reference](#manifest-reference)
- [Input-schema reference](#input-schema-reference)
- [The handler contract](#the-handler-contract)
- [Authorization policies](#authorization-policies)
- [Testing your tool](#testing-your-tool)
- [platformOS gotchas that bite tool authors](#platformos-gotchas-that-bite-tool-authors)
- [Checklist](#checklist)

---

## Mental model

Where files live (physical → logical). platformOS only resolves partials under
`views/partials`, so tools live there and are referenced by the `mcp/…` namespace:

```
app/views/partials/mcp/
  registry.liquid                    →  mcp/registry            (explicit tool list)
  tools/<name>/manifest.liquid       →  mcp/tools/<name>/manifest   THE TOOL
  tools/<name>/call.liquid           →  mcp/tools/<name>/call       THE TOOL (handler)
  policies/<name>.liquid             →  mcp/policies/<name>     (authorization)
app/graphql/mcp/<name>.graphql       →  mcp/<name>              (a handler's OPTIONAL query — not a tool)
```

> **A tool never lives in `app/graphql/mcp/`.** A tool is exactly its two files under
> `app/views/partials/mcp/tools/<name>/` (manifest + handler). `app/graphql/mcp/` holds
> the query/mutation a *handler executes*, and it exists only when the handler runs its
> **own bespoke** query — i.e. `--op read`/`create`. A handler that wraps an app command
> (`--op command`) or reuses an existing query (e.g.
> `graphql r = 'modules/community/queries/events/search'`) needs **no** file there.
> `mcp/<name>` is just the resolution convention (`graphql g = 'mcp/<name>'` →
> `app/graphql/mcp/<name>.graphql`), not a requirement of being a tool.

> You cannot use a bare `app/mcp/tools/…` directory — platformOS ignores files
> outside its recognized dirs (`deploy` reports them as `files_not_matched`).

The pipeline the engine runs for every `tools/call`, in order:

```
authenticate → rate-limit → resolve → validate → authorize → EXECUTE(your handler) → attest → respond
```

Your handler runs **last**, only after the call is proven authentic, permitted, and
schema-valid. It can trust its inputs.

---

## Anatomy of a tool

A tool is **two files** (`app/views/partials/mcp/tools/<name>/`) plus a policy and one
registration line:

1. **manifest** — declares the tool: name, version, description, `input_schema`,
   `authorization_policy`, `mutating`, `requires_approval`, `handler`. Read by the
   engine (to validate/serve) and by the agent (the description). Reviewed as
   security-relevant.
2. **handler** — the Liquid partial that does the work and returns a typed result.
3. **policy** — a named authorization policy the manifest points at (may be shared
   across tools).
4. **registry line** — adds `{ name, path }` to `mcp/registry`. A tool is served
   only if it is registered here **and** its manifest is valid.

**Optional dependency — the handler's query.** If the handler runs its own bespoke
GraphQL, that query lives in `app/graphql/mcp/<name>.graphql` and the handler calls it
as `graphql g = 'mcp/<name>'`. This file is **not** part of the tool — it is data the
handler happens to read. `read`/`create` tools have one; `command` tools and tools that
reuse an existing query have none. A `.graphql` file can also back several tools (a
handler may call any `mcp/<other>` query). So: a tool is always its manifest + handler;
the query is a per-handler add-on.

---

## Scaffolding a draft tool

The module ships a native platformOS generator (`pos-cli generate`) that emits a
**draft** tool. It has three modes, based on what the tool should talk to:

```bash
pos-cli generate list                       # shows: tool → modules/mcp/generators/tool

# read — search a TABLE by keyword (manifest + call + read.graphql)
pos-cli generate run modules/mcp/generators/tool find_listings \
  --op read --table modules/marketplace/listing

# create — write records directly to a TABLE (manifest + call + create.graphql)
pos-cli generate run modules/mcp/generators/tool create_listing \
  title:string price_minor:integer --op create --table modules/marketplace/listing

# command — wrap an existing APP COMMAND (manifest + call; NO graphql).
# Omit the fields → auto-discovered from the command's build source.
pos-cli generate run modules/mcp/generators/tool create_event_governed \
  --op command --command modules/community/commands/events/create
```

| mode | based on | handler does | use when |
|---|---|---|---|
| `read` | a table + its fields | `records(filter: contains…)` | simple keyword search |
| `create` | a table + declared fields | raw `record_create` | trivial writes, no business rules |
| `command` | an existing app **command** | builds an object → invokes the command's build→check→execute | **anything real** — inherits the command's validations, relationships, and side-effects (same guardrails as the app's UI) |

`command` mode is the production path: the agent gets the exact business logic your
app already enforces, not a raw table write. It generates **no `.graphql`** (the
command owns its queries) and leaves three clearly-marked TODOs only you can resolve:
(1) map arguments to the command's object keys, (2) pass the identity param the
command needs (e.g. `profile:` resolved from `principal.user_id`), (3) the success
fields to surface. The command's `{ valid, errors }` contract is already wired to the
handler return + field-error surfacing.

**Field auto-discovery.** Omit the `name:type` list and the generator parses the
command's `build.liquid` (physical path `modules/<m>/public/lib/commands/<path>/build.liquid`,
or `app/lib/commands/<path>[/build].liquid`) for the `object.<key>` accessors it
consumes, drops system-set keys (`id`/`uuid`/`*_uuid`/`c__*`), and infers types by
name. It's a **reviewed suggestion**, not a contract — a command has no formal typed
signature, so types are inferred and dynamically-computed keys can be missed. The run
prints the discovered fields and flags them for review; explicit `name:type` args
always override. (Verified against `modules/community/commands/events/create` →
`name, short_description, description, link, venue, start_date:datetime,
end_date:datetime, commentable:boolean, status`.)

(pos-cli installs the generator's runtime dependency on first run — the same
"Install dependencies?" prompt every platformOS generator uses.)

**Propose-then-validate (all modes):** the generated manifest leaves
`authorization_policy` EMPTY on purpose. An empty policy fails the meta-schema, so the
draft is **excluded from the registry** until you set a named policy, tighten the
schema, decide `requires_approval`, and register it — it can never reach an agent
unreviewed. The generator never touches `mcp/registry`. Finish the draft with the
steps below.

## Walkthrough: a read tool end to end

We'll build `search_events` (already shipped as the reference tool).

### 1. The data query — `app/graphql/mcp/search_events.graphql`

```graphql
query search_events($keyword: String!, $limit: Int!) {
  events: records(
    per_page: $limit
    filter: {
      table: { value: "modules/community/event" }
      properties: [{ name: "status", value: "published" }]
      or: [
        { properties: { name: "name", contains: $keyword } }
        { properties: { name: "short_description", contains: $keyword } }
        { properties: { name: "description", contains: $keyword } }
      ]
    }
    sort: [{ properties: [{ name: "start_date", order: ASC }] }]
  ) {
    total_entries
    results {
      id
      name: property(name: "name")
      short_description: property(name: "short_description")
      start_date: property(name: "start_date")
      venue: property(name: "venue")
    }
  }
}
```

Arguments arrive as **typed GraphQL variables** — never build the query string by
concatenation. This is the injection boundary.

### 2. The manifest — `app/views/partials/mcp/tools/search_events/manifest.liquid`

```liquid
{% liquid
  assign m = '{}' | parse_json
  hash_assign m['name'] = 'search_events'
  hash_assign m['version'] = '1.0.0'
  hash_assign m['description'] = 'Search the community published events by keyword and return upcoming matches. Read-only; returns at most 20 events.'
  assign schema = '{"type":"object","additionalProperties":false,"required":["query"],"properties":{"query":{"type":"string","minLength":1,"maxLength":80,"description":"keyword to match against event title and description"},"limit":{"type":"integer","minimum":1,"maximum":20,"description":"max events to return (default 10)"}}}' | parse_json
  hash_assign m['input_schema'] = schema
  hash_assign m['mutating'] = false
  hash_assign m['authorization_policy'] = 'public_read'
  hash_assign m['requires_approval'] = false
  hash_assign m['idempotent'] = true
  hash_assign m['handler'] = 'mcp/tools/search_events/call'
  return m
%}
```

### 3. The handler — `app/views/partials/mcp/tools/search_events/call.liquid`

```liquid
{% liquid
  assign keyword = arguments.query
  assign limit = arguments.limit | default: 10

  graphql res = 'mcp/search_events', keyword: keyword, limit: limit

  assign events = '[]' | parse_json
  for r in res.events.results
    assign e = '{}' | parse_json
    hash_assign e['id'] = r.id
    hash_assign e['name'] = r.name
    hash_assign e['summary'] = r.short_description
    hash_assign e['start_date'] = r.start_date
    hash_assign e['venue'] = r.venue
    assign events = events | array_add: e
  endfor

  assign result = '{}' | parse_json
  hash_assign result['query'] = keyword
  hash_assign result['count'] = res.events.total_entries
  hash_assign result['events'] = events

  assign out = '{}' | parse_json
  hash_assign out['ok'] = true
  hash_assign out['result'] = result
  return out
%}
```

### 4. Register it — `app/views/partials/mcp/registry.liquid`

```liquid
assign e1 = '{}' | parse_json
hash_assign e1['name'] = 'search_events'
hash_assign e1['path'] = 'mcp/tools/search_events'
assign tools = tools | array_add: e1
```

### 5. Deploy and it appears in `tools/list`

```bash
pos-cli deploy <env>
curl -s -X POST https://<host>/mcp -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

---

## Manifest reference

| Field | Required | Meaning |
|---|---|---|
| `name` | yes | Unique. `^[a-z][a-z0-9_]{2,63}$` (no leading underscore, no dashes). Must equal the registered name. |
| `version` | yes | SemVer `MAJOR.MINOR.PATCH`. Surfaced in `tools/list._meta` and the ledger. |
| `description` | yes | Read by the model. Reviewed for injection (imperative instructions, cross-tool references, encoded blobs → flagged by lint). |
| `input_schema` | yes | JSON-Schema subset (below). Root **must** be `type: object`. `additionalProperties` is forced `false`. |
| `mutating` | yes | `true` ⇒ (Phase 2) runs inside a transaction. |
| `authorization_policy` | yes | Named policy. **A blank policy makes the manifest invalid** — no implicit allow. |
| `requires_approval` | yes | `true` ⇒ (Phase 2) never runs inline; creates a pending approval. |
| `handler` | yes | Partial path invoked with the validated arguments. |
| `idempotent` | no | Declares safe retry (Phase 2 idempotency keys). |
| `output_schema` | no | Advisory; validated at load if present. |
| `audit_fields` | no | Argument keys recorded verbatim in the ledger (must be non-sensitive). |
| `timeout_ms` | no | Handler budget; defaults from config. |
| `deprecated` | no | Still callable; flagged with a sunset note in `tools/list`. |

Breaking a schema? Bump **major** and publish as a **new tool name**
(`search_events_v2`), mark the old `deprecated: true`, keep both for a window.
Additive change (new optional field) ⇒ minor bump, same name.

---

## Input-schema reference

Supported keywords (anything else rejects the manifest at load — an implementer must
never declare a constraint the engine does not enforce):

- `type`: `object` | `string` | `integer` | `number` | `boolean` | `array`
- object: `properties`, `required`, `additionalProperties` (always treated as `false`)
- string: `minLength`, `maxLength`, `pattern` (bounded — no catastrophic backtracking), `enum`, `format` (`date-time` | `email` | `uuid`)
- number/integer: `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `enum`
- array: `items` (single schema), `minItems`, `maxItems`
- annotations: `description`, `title`, `default`

Validation is **strict, no coercion**: `"5"` is rejected for an `integer`, a null value
for a typed field is rejected, unknown keys are rejected. Depth is capped
(`max_schema_depth`, default 5). Agents emit well-formed JSON; strictness surfaces
their errors instead of hiding them.

---

## The handler contract

The handler receives:

| Local | What |
|---|---|
| `arguments` | validated + type-correct arguments (a plain hash) |
| `principal` | `{ id: "user:<n>", user_id }` — the resolved caller |
| `agent` | `{ id, client_id, allowed_tools }` |
| `context_meta` | `{ tool_name, tool_version, request_id }` |

It returns a hash:

```liquid
{ "ok": true,  "result": { ... }, "subject": { "type": "record", "id": "…" } }   # success (subject optional)
{ "ok": false, "error": { "code": 409, "message": "Order not cancellable", "retryable": false } }   # business failure
```

- On `ok: true`, `result` becomes the MCP `structuredContent` and a text rendering.
- On `ok: false`, the engine returns an MCP **tool error** (`isError: true`) — the
  agent can reason about it. Business *state* checks (e.g. "already shipped") belong
  here; authorization does **not** (the policy already ran).
- A handler that throws or returns a malformed shape is caught and mapped to a
  generic tool error — it never 500s the endpoint.

### Handler rules (enforced in review)

- **Never** interpolate `arguments` into a GraphQL query string. Pass them as typed
  variables. String concatenation is the injection path and is a blocking finding.
- **Never** fetch a URL taken from `arguments`. External calls use fixed endpoints.
- **Never** write the ledger directly.
- Mutating side effects that are irreversible externally (email, payment) must not
  run inline — they belong to the Phase-2 approval/enqueue path.

---

## Authorization policies

`app/views/partials/mcp/policies/<name>.liquid`, referenced by `authorization_policy`.
Receives `principal`, `agent`, `arguments`, `tool`, `delegation_mode`; returns a
boolean or `{ allow, reason }`. Evaluated against the **principal**.

```liquid
{% comment %} owner-only: caller must own the listing they are editing {% endcomment %}
{% liquid
  assign r = '{}' | parse_json
  graphql q = 'app/queries/listings/owner', id: arguments.listing_id
  if q.record.owner_id == principal.user_id
    hash_assign r['allow'] = true
    hash_assign r['reason'] = 'owner'
  else
    hash_assign r['allow'] = false
    hash_assign r['reason'] = 'not_owner'
  endif
  return r
%}
```

**Fail-closed:** a policy that is missing, errors, or returns a non-allow shape
denies. The wire response is a generic `Forbidden`; the `reason` goes to the ledger
only. Ship an explicit policy even for "public" access — `public_read` returns
`{ allow: true }` so the decision is visible in review. There is no implicit allow.

---

## Testing your tool

Mint a token (`/mcp-tools`) or seed one, then drive the endpoint:

```bash
TOKEN=... ; U=https://<host>/mcp
# good call
curl -s -X POST "$U" -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_events","arguments":{"query":"jazz"}}}'
# bad args are rejected before your handler runs
curl -s -X POST "$U" -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_events","arguments":{"limit":"5"}}}'
```

Add assertions for your tool to `tests/conformance.test.mjs` and run
`npx vitest run tests/conformance.test.mjs`. Iterate on the handler in isolation with
`liquid_render` before wiring — but always confirm over real HTTP: request params
behave differently there (see gotchas).

---

## platformOS gotchas that bite tool authors

These cost real debugging time; internalize them.

- **`type_of` returns capitalized** — `'String'`, `'Integer'`, `'Boolean'`, `'Array'`,
  `'Hash'` (and `'null'` for null). Downcase before comparing.
- **Request params are `HashWithIndifferentAccess`, not `Hash`.** `type_of` on them
  returns that long string. The engine normalizes `arguments` for you via a JSON
  round-trip, so your handler sees plain types — but if you inspect raw
  `context.params` yourself, account for it. Always test over real HTTP, not only
  `liquid_render` (which uses `parse_json` and hides this).
- **Filter precedence trap:** `arr | array_add: x | append: y` parses as
  `(arr | array_add: x) | append: y` and **stringifies the whole array**. Build the
  string first: `assign msg = x | append: y` then `array_add: msg`.
- **`property(name:)` always returns a string.** Coerce before arithmetic/comparison
  (`| plus: 0`) — `"5" > 3` raises "String vs Integer".
- **`case`/`when` does not fall through.** `when 'a'` then `when 'b'` on separate lines
  gives the first an *empty* body. Use `when 'a', 'b'` for a shared branch.
- **No `''` apostrophe escaping** in Liquid strings — avoid apostrophes in
  descriptions (`the community` not `the community's`).
- **`unless` must close with `endunless`** (not `endif`) — the linter catches it.
- **Datetime columns reformat on read** (`…:03Z` → `…:03.000Z`). Never hash a value
  you read back from a `datetime` property; store hashed timestamps as strings.
- **No runtime filesystem.** The engine cannot scan for tools — that is why the
  explicit `registry` partial exists. A dropped tool directory does nothing until
  registered.
- **Partials live under `views/partials`.** `app/mcp/tools/...` is silently dropped by
  deploy. Use `app/views/partials/mcp/tools/...`, referenced as `mcp/tools/...`.
- **HTML pages escape `echo`.** On the operator pages, structural HTML must be literal
  template; values through `{{ }}` are escaped (that is the correct XSS defense).

---

## Lint your tools

Before registering or deploying, run the static tool linter — it reads each tool's
manifest, handler, and query and flags the security/quality issues the runtime
meta-schema can't see (it never has the handler source):

```bash
node tests/lib/lint-tools.mjs                 # errors fail; warnings/infos print
node tests/lib/lint-tools.mjs --strict        # warnings fail too (recommended in CI)
node tests/lib/lint-tools.mjs --json          # machine-readable
node tests/lib/lint-tools.mjs --include-vuln  # also lint the vuln_* negative controls
```

The `vuln_*` fixtures are deliberately-insecure negative controls for the runtime
agentic-eval (gated by `MCP_ENABLE_VULN_TOOLS`) — the linter **skips them by default**;
`--include-vuln` opts them back in.

It lints **every** tool directory, including unregistered drafts (so you can check a
scaffolded tool before wiring it up), and exits non-zero on findings — drop it into CI
next to `conformance.mjs` and `eval.mjs`. It is fully static (no instance, no deps).

What it catches — a sample, not the whole list:

- **Injection / RCE** — a GraphQL query or `function`/`include`/`render` path derived
  from `arguments` (dynamic execution); Liquid interpolation inside a `.graphql` file;
  building a query string from arguments near a `graphql` call.
- **SSRF** — an external `api_call` whose URL involves `arguments`.
- **Ledger tampering** — a handler that writes `mcp_ledger`.
- **Mass/destructive writes** — `records_delete_all`; `record_delete` without a table.
- **Schema correctness** — unsupported keywords, invalid `type`, invalid or
  ReDoS-prone `pattern`, `minLength > maxLength`, `enum` values that mismatch the type,
  `required` naming an undeclared property, `additionalProperties: true`.
- **Content hardening, per field kind** — it classifies each string field (datetime,
  email, url, id, slug, display, keyword, …) and gives *tailored* advice: a `*_date`
  field is told to add `format: date-time`; a **display** field is told to add
  `pattern: ^[^<>]*$` to reject HTML; a **url** field is warned about `javascript:`
  URIs and SSRF; an **id** field is told to add a strict pattern. Unbounded strings/
  numbers/arrays are flagged.
- **Governance & audit** — empty `authorization_policy` (no implicit allow); a missing
  policy file; `mutating` mislabeled (a handler that mutates but declares
  `mutating: false` — it would run without a transaction); `audit_fields` that look
  like PII or name a non-existent field; a mutating tool with a permissive policy and
  no approval; tool-poisoning phrases in the description.

The linter is advisory-but-strict: real vulnerabilities are **errors** (fail the run),
likely bugs are **warnings**, and correct-by-context nudges are **info**.

---

## Security boundaries — what the engine does NOT do for you

The engine gives every tool the governance *planes* — authentication, per-call
authorization, transaction rollback, rate limiting, the attestation ledger, and
**schema validation of what you declared**. Those are automatic. But a tool is still
your code wired to your data, and several classes of vulnerability are the **author's
responsibility**. A naive tool passes all the engine's checks and still ships a hole.
Internalize these.

**1. Validation checks SHAPE, not MEANING.** `input_schema` enforces type, length,
range, enum, and pattern — it does not understand your content. A string field with
`maxLength: 100` happily accepts `<img src=x onerror=alert(1)>`, `'; DROP TABLE …`,
`{{ 7*7 }}`, or `../../etc/passwd`. Those are all valid 30-character strings. If a
value must exclude something, **you must say so** — e.g. a display field that should
never contain HTML:

```json
{ "type": "string", "maxLength": 100, "pattern": "^[^<>]*$" }
```

The engine will then reject the payload at validation, before your handler runs. It
will not add that constraint for you.

**2. Injection is prevented only if YOU pass typed variables.** The engine can't stop
a handler that concatenates:

```liquid
# NEVER — string interpolation is the injection path
graphql r = 'my_query', filter: "name = '" | append: arguments.q | append: "'"
# ALWAYS — typed variables; the value can never become query syntax
graphql r = 'my_query', q: arguments.q
```

The safe form is the only form. `app/graphql/mcp/*.graphql` files exist precisely so
values fill declared variables and can never be code.

**3. Raw table writes bypass your business rules.** A `--op create` (or hand-rolled
`record_create`) tool talks straight to the table. It skips everything your app's own
command does — moderation status, required-field defaults, ownership relationships,
uniqueness checks, feed events. Real consequences seen in practice: events written
`status: published` (skipping the moderation queue) with `end_date: null` (invisible
in every listing that filters `end_date >= now`). **For anything with business logic,
use `--op command`** so the tool inherits the exact guardrails the site enforces. Raw
modes are for genuinely trivial, rule-free data only.

**4. "Authorized" ≠ "should be published."** Your policy decides *who* may call the
tool. It does not decide whether the *content* is acceptable. For anything an agent
creates that becomes visible to others, layer content controls: route through a
command that sets `status: pending` (human moderation), or set
`requires_approval: true` (operator approves each call), or both.

**5. SSRF / egress is on you.** The engine never fetches an agent-supplied URL, but it
can't stop a handler that does. Never take a host/URL/path from `arguments` and call
it. External calls use fixed, configured endpoints.

**6. What you return can leak.** `result` and `error` go to the agent verbatim. Don't
put internal ids, other users' data, secrets, stack traces, or raw GraphQL errors in
them. Surface only what the caller is entitled to; field-level *validation* errors are
fine (they help the agent self-correct), engine internals are not.

Rule of thumb: **the engine makes every call accountable and reversible; making each
call *correct and safe* is the tool's job.** When in doubt, wrap a reviewed app
command rather than writing raw.

---

## Checklist

- [ ] `input_schema` root is `type: object`, `additionalProperties: false`, tight
      `required` + bounds (`maxLength`, `maximum`, `enum`).
- [ ] Content constraints where meaning matters — e.g. `pattern: "^[^<>]*$"` on
      display strings so HTML/script payloads are rejected at validation.
- [ ] `authorization_policy` names a real, fail-closed policy (never blank).
- [ ] `mutating` and `requires_approval` set honestly; content-creating tools are
      moderated (command sets `pending`) or gated (`requires_approval: true`).
- [ ] Prefer **`--op command`** (wrap an app command) over raw table writes when any
      business logic, moderation, defaults, or relationships apply.
- [ ] Handler passes arguments as typed GraphQL variables — no string interpolation,
      no agent-supplied URLs, no ledger writes.
- [ ] Handler returns the `{ ok, result?, subject?, error? }` contract; business-state
      failures use `ok: false`; `result`/`error` leak no internals or other users' data.
- [ ] `description` is factual, specific, free of imperative/model-directed text.
- [ ] Registered in `mcp/registry` with a matching `name`.
- [ ] Verified over real HTTP: good call, bad args rejected, unauthorized denied,
      an injection/XSS payload rejected, and a ledger entry appears.
