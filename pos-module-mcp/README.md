# pos-module-mcp

Turn a platformOS instance into a **governed Model Context Protocol (MCP) server**.
An external agent (Claude, ChatGPT, a partner's internal agent) can read the
instance's data and invoke its business logic through an interface that is
**typed, identity-bound, authorized, reversible, and attested**.

MCP's structural gap is the absence of a semantic control plane between an agent's
intent and the system action it triggers. platformOS already ships that plane —
named authorization policies, `transaction`/`rollback`, a typed GraphQL schema,
and durable records. This module assembles those primitives into an MCP surface.
It is **not** a way to expose GraphQL to an LLM — that is the anti-pattern it
exists to prevent.

Full design: [`pos-module-mcp-spec.md`](./modules/mcp/docs/pos-module-mcp-spec.md). Tool-authoring
deep dive: [`docs/authoring-tools.md`](./modules/mcp/docs/authoring-tools.md).

---

## Architecture — two layers

**Layer 1 — the engine (this module).** Identical on every instance, zero business
logic: JSON-RPC transport, identity + access control, JSON-Schema validation,
named-policy authorization, rate limiting, transaction-wrapped execution, idempotency,
a human-in-the-loop approval gate, a hash-chained attestation ledger, tool/resource/
prompt discovery, error mapping, the operator console, an eval harness, and a tool
scaffolder.

**Layer 2 — the app's tools.** Unique per instance. The app declares its own tools,
authorization policies, prompts, and connection instructions. **All business meaning
lives here.** On platformOS these are partials under `app/views/partials/mcp/`
(referenced by the logical namespace `mcp/…`):

```
app/views/partials/mcp/
  registry.liquid                # explicit [{name, path}] list of tools to serve
  instructions.liquid            # house rules sent to agents on initialize
  tools/<name>/manifest.liquid   # a tool's declaration (name, schema, policy, handler)
  tools/<name>/call.liquid       # the tool's handler
  policies/<name>.liquid         # a named authorization policy
  prompts.liquid                 # [{name, description, arguments, template}] prompt list
  prompts/<name>.liquid          # a prompt template (renders text from arguments)
app/graphql/mcp/<name>.graphql   # queries/mutations a handler calls
```

The engine is **inert-but-armed** on install: endpoint live, auth wired, tables
present, but zero tools until the app registers them. It is **standalone** — it
references no other business module in code (enforced by the engine decoupling guard in
`tests/ci-static.sh`); it needs the `user` module for session login on the operator pages.
`pos-module.json` also declares `community` and `components`, which the demo Layer-2
tools in `app/` wrap.

---

## Endpoints

| Path | Purpose |
|---|---|
| `POST /mcp` | JSON-RPC 2.0 MCP endpoint (protocol `2025-06-18`) |
| `GET /mcp-health` | Liveness + readiness probe — `{status, checks:{config,database}}`, 200/503 (public, cheap) |
| `GET /.well-known/oauth-protected-resource` | OAuth resource metadata (RFC 9728) |
| `/mcp-tools` | Token console — **approved** members mint/revoke bearer tokens; others request access |
| `/mcp-tools/request` (POST) | A member requests MCP access |
| `/mcp-admin` | Operator console: ledger, metrics, approvals, access mgmt, registry, eval |
| `/mcp-admin/{approve,reject}` (POST) | Operator decides a pending tool-call approval |
| `/mcp-admin/reject-principal` (POST) | Operator bulk-rejects every pending approval for one principal (queue drain) |
| `/mcp-admin/access` (POST) | Operator grants/revokes a member's access/role |
| `/mcp-admin/token-revoke` (POST) | Operator kill-switch — revoke any bearer token by id |
| `/mcp-admin/eval` (POST) | Operator runs the tool-surface eval |
| `/mcp-admin/ledger-export.json` (GET) | Operator — paginated JSON ledger export (honors active filters; capped) |

**RPC methods:** `initialize`, `ping`, `tools/list`, `tools/call`, `resources/list`,
`resources/read`, `resources/templates/list`, `prompts/list`, `prompts/get`,
`logging/setLevel`. Plus the built-in tool `mcp_approval_status` (poll a pending
approval).

---

## Configuration

Two-part: **defaults** in code at
[`public/lib/commands/config.liquid`](./modules/mcp/public/lib/commands/config.liquid) (travel
with the module), and **per-instance overrides** in a single platformOS constant
**`MCP_CONFIG`** (a JSON object, shallow-merged over the defaults with nested merge
for `defaults`/`resources`). Values live in the encrypted constant store, read on
every request — no redeploy needed.

### Overridable keys

| Key | Default | Controls |
|---|---|---|
| `server_name` | `pos-module-mcp` | `serverInfo.name` + the `claude mcp add <name>` alias on `/mcp-tools` |
| `endpoint_path` | `/mcp` | endpoint path (advertised as the OAuth resource id) |
| `tools_list_scope` | `open` | `open` advertises every tool to any caller (MCP-default open discovery); `principal` scopes `tools/list` to what the caller may actually call — restricted tools aren't leaked to unauthorized/anonymous callers (least-disclosure). Execution is authorized per-call either way. |
| `defaults.rate_limit_per_min` | `60` | per-principal fixed-window rate limit |
| `defaults.max_input_bytes` | `65536` | request body size cap |
| `defaults.max_schema_depth` | `5` | argument-validation nesting cap |
| `defaults.timeout_ms` | `5000` | handler time budget |
| `defaults.idempotency_window_seconds` | `86400` | how long an idempotency key can replay |
| `defaults.approval_window_seconds` | `604800` | how long a pending approval can be acted on |
| `defaults.approval_max_pending_per_principal` | `3` | max non-expired pending approvals per principal (queue-flood cap) |
| `resources.expose_markdown_pages` | `false` | `.md` resources on/off toggle |
| `resources.markdown_page_prefixes` | `["docs"]` | slug prefixes exposed as resources (allowlist) |
| `ledger.retention_days` | `730` | ledger retention |
| `oauth.issuer` / `oauth.audience` | `""` / `server_name` | advertised AS + expected audience |
| `registry_partial` / `policy_prefix` / `instructions_partial` / `prompts_partial` | `mcp/registry`, `mcp/policies`, `mcp/instructions`, `mcp/prompts` | Layer-2 hook paths |

Separately, **`MCP_ADMIN_USER_IDS`** (comma-separated pOS user ids) is the operator
**bootstrap** — those users are operators even before any access row exists (see
Access control).

### Setting a constant

```bash
pos-cli constants set <env>                              # interactive
# or GraphQL:  mutation { constant_set(name:"MCP_CONFIG", value:"{...}") { name } }
# or Partner Portal → instance → Constants
```

Example — brand the server, raise the limit, expose docs, in one object:

```json
{ "server_name": "acme-community",
  "defaults": { "rate_limit_per_min": 120 },
  "resources": { "expose_markdown_pages": true, "markdown_page_prefixes": ["docs","help"] } }
```

---

## Authoring a tool (Layer 2)

> **Full guide + platformOS gotchas:** [`docs/authoring-tools.md`](./modules/mcp/docs/authoring-tools.md).

### Scaffold a draft (fastest start)

The module ships a native `pos-cli generate` generator with three modes:

```bash
pos-cli generate list                       # shows: tool → modules/mcp/generators/tool

# read — search a table by keyword
pos-cli generate run modules/mcp/generators/tool find_listings \
  --op read --table modules/marketplace/listing

# create — write records directly to a table (raw record_create)
pos-cli generate run modules/mcp/generators/tool create_listing \
  title:string price_minor:integer --op create --table modules/marketplace/listing

# command — wrap an existing APP COMMAND (the production path; inherits the
# command's validations, relationships, and side-effects). Omit the field list
# and the generator AUTO-DISCOVERS the input fields from the command's build source.
pos-cli generate run modules/mcp/generators/tool create_event_governed \
  --op command --command modules/community/commands/events/create
```

**What each mode is based on:**
- **`read` / `create`** scaffold from a **table** (`--table`) and its fields — the
  handler talks to `records` / `record_create` directly. Fast, but bypasses your
  business logic.
- **`command`** scaffolds from an **app command** (`--command`) — the handler builds
  an object from the input fields and invokes that command's build→check→execute
  pipeline, so the tool gets the **same guardrails as your app's own UI** (validations,
  relationships, feed events). This is the recommended path for anything non-trivial.
  No `.graphql` file is generated — the command owns its own queries. **Field
  auto-discovery:** if you omit the field list, the generator reads the command's
  `build` source, extracts the `object.<key>` accessors it consumes, filters out
  system-set keys (`id`, `uuid`, `*_uuid`, `c__*`), and infers types by name
  (`*_date`/`*_at`→datetime, `is_`/`commentable`→boolean, `*_count`/`*_minor`→integer).
  It's a *suggestion to review* — types are inferred, and computed keys may be missed —
  so the draft prints the discovered fields and flags them for review. Explicit
  `name:type` args always override. The generated handler also has TODOs for the three
  things only you know: arg→object-key mapping, the identity param the command needs
  (e.g. `profile:` resolved from `principal.user_id`), and the success fields to surface.

All three emit a **draft**: `authorization_policy` is empty **on purpose** — an empty
policy fails the meta-schema, so the tool is excluded from the registry until a human
sets a policy, tightens the schema, decides `requires_approval`, and registers it
(propose-then-validate). The generator never touches `mcp/registry`. (pos-cli installs
the generator's runtime dependency on first run — the same "Install dependencies?"
prompt every platformOS generator uses.)

### By hand

1. `app/views/partials/mcp/tools/<name>/manifest.liquid` returning the manifest:

   ```liquid
   {% liquid
     assign m = '{}' | parse_json
     hash_assign m['name'] = 'search_events'
     hash_assign m['version'] = '1.0.0'
     hash_assign m['description'] = 'Search published events by keyword.'   # model-read; reviewed
     hash_assign m['input_schema'] = '{"type":"object","additionalProperties":false,"required":["query"],"properties":{"query":{"type":"string","maxLength":80}}}' | parse_json
     hash_assign m['mutating'] = false            # true → runs in a transaction
     hash_assign m['authorization_policy'] = 'public_read'   # REQUIRED — no implicit allow
     hash_assign m['requires_approval'] = false   # true → human-in-the-loop gate
     hash_assign m['idempotent'] = false          # true → honor an idempotency key
     hash_assign m['handler'] = 'mcp/tools/search_events/call'
     return m
   %}
   ```

2. Handler `…/call.liquid` — receives validated `arguments`, `principal`, `agent`,
   `context_meta`; returns `{ ok, result?, subject?, error? }`. **Rules:** pass
   arguments as typed GraphQL variables (never string-interpolate), never fetch an
   agent-supplied URL, never write the ledger directly.

3. Register in `app/views/partials/mcp/registry.liquid`:

   ```liquid
   assign e = '{}' | parse_json
   hash_assign e['name'] = 'search_events'
   hash_assign e['path'] = 'mcp/tools/search_events'
   assign tools = tools | array_add: e
   ```

A tool is served only if **registered AND** its manifest passes the meta-schema —
a manifest with no `authorization_policy` or an unsupported JSON-Schema keyword is
excluded and logged, never served degraded.

Supported `input_schema` subset: `type` (object/string/integer/number/boolean/array),
`required`, `properties`, `additionalProperties` (forced `false`), `enum`,
`minimum`/`maximum`/`exclusiveMinimum`/`exclusiveMaximum`, `minLength`/`maxLength`/
`pattern`, `items`/`minItems`/`maxItems`, `format` (date-time/email/uuid). Validation
is strict (no coercion).

### Authorization policies

`app/views/partials/mcp/policies/<name>.liquid` returns `true`/`false` or
`{ allow, reason }`; receives `principal`, `agent`, `arguments`, `tool`,
`delegation_mode`; evaluated against the **principal**; **fail-closed** (missing/
erroring/malformed → deny). Ships `public_read` (explicit allow for any authenticated
principal) and `admin_only` (operator allowlist).

### Connection instructions

`app/views/partials/mcp/instructions.liquid` returns the house-rules string sent on
`initialize`. Authored by the app; the engine falls back to a default. Model-read —
review as security-relevant.

---

## Mutating tools — transactions, idempotency, approval

- **`mutating: true`** → the handler AND its ledger attestation run inside **one
  `{% transaction %}`**. On success both commit together; on handler failure, a
  thrown handler, or a failed ledger append, the whole thing rolls back (no partial
  state) and a `rolled_back` entry is still recorded. Reversibility is what makes an
  operator willing to let an agent write.
- **`idempotent: true`** → a client may send `params._meta.idempotencyKey`. A retry
  with the same key (per principal) replays the original result instead of
  re-executing; the same key with different arguments is a `409`. For mutating tools
  the idempotency record commits inside the transaction, so a mutation can never
  commit without its replay record.
- **`requires_approval: true`** → the tool never runs inline. The call records an
  intent and returns an opaque **handle** + `pending_approval`; an operator approves
  in `/mcp-admin`, and it then executes **as the original principal** (re-validated
  and re-authorized), with the execution ledger entry linked to the request by
  `request_id`. The agent polls the built-in `mcp_approval_status` tool with the
  handle. This keeps genuinely high-impact actions out of autonomous execution.
  **Queue-flood protection:** a duplicate pending request (same principal + identical
  argument hash) returns the existing handle instead of stacking a new one, and each
  principal is capped at `approval_max_pending_per_principal` non-expired pending
  approvals (default 3). Excess is refused (`queue_full`) and both cases are attested
  (`approval_duplicate` / `approval_throttled`) and counted as violations. An operator
  can drain a principal's entire queue in one action from the console.

---

## Prompts (Layer 2)

Reusable, parameterized prompt templates the server offers to agents.
`app/views/partials/mcp/prompts.liquid` returns
`[{ name, title?, description, arguments, template }]`; each `template` is a partial
(`app/views/partials/mcp/prompts/<name>.liquid`) that receives `arguments` and returns
prompt text (one user message) or a messages array. Served via `prompts/list` and
`prompts/get` (required-argument presence is enforced). Interpolate argument values
with `append`, not `{{ }}`, to avoid output escaping.

---

## Access control & operators

Access is **module-owned** (portable — no coupling to community/user roles) via the
`mcp_access` table, with two roles distinct from the platform `admin`:

- **`user`** — approved to mint bearer tokens at `/mcp-tools`.
- **`admin`** — an operator: the console, approvals, evals, and granting access.

Flow: a signed-in member with no access sees **Request access** on `/mcp-tools`; an
operator approves in `/mcp-admin`; the member can then mint tokens. Operators grant/
revoke roles from the console. **Bootstrap:** user ids in `MCP_ADMIN_USER_IDS` are
active admins without a row — the first operator on a fresh instance.

**Tokens.** A bearer is bound to a real pOS user (the principal); only its SHA-256
digest is stored (raw shown once). Every call is authorized as that user, rate-limited
per principal, and attested. Revoke on `/mcp-tools` (IDOR-guarded).

> An external-AS / JWT strategy (`jwt_decode` against issuer/JWKS) is scaffolded for
> instances fronting a real authorization server; the default is instance-issued
> tokens.

### Operator console (`/mcp-admin`)

Gated to `admin`; a tabbed console (Overview · Approvals · Tokens & access · Ledger ·
Tools & config) that preserves context on switch. Shows: hash-chain verification
status; metrics (calls, denial/rollback rate, schema rejections, rate-limited,
approval throttle/dup, by-tool); **pending approvals** (approve/reject, plus
per-principal bulk-drain); **active tokens** with an abuse watchlist (violation count
per principal) and one-click revoke; **MCP access** (approve requests, make admin/user,
revoke, grant by id); **registered tools** (name/version/read|write/approval/policy +
excluded manifests); the **tool-surface eval** (Run + latest result); and a filterable
ledger with security-lens quick filters and a paginated JSON export.

---

## Security posture

- **No implicit allow** — a tool without a policy is invalid; no default-permit path,
  no generic execution tool.
- **Strict validation** — type-checked, no coercion; unknown keys and out-of-range
  values rejected before any handler runs.
- **Reversibility** — mutating tools are transaction-wrapped; failure rolls back
  atomically.
- **Tamper-evident ledger** — every post-auth outcome (allowed and denied) is a
  hash-chained entry (`entry_hash = sha256(canonical(payload) || prev_hash)`);
  arguments stored as a hash, never raw; `verify_chain` detects any edit/delete/
  backdate/reorder. Immutability is append-only-by-construction + tamper-*evidence*
  (a privileged insider is detected, not silently prevented — the admin API is
  god-mode on platformOS). Pre-auth failures are logged, never chained (no anonymous
  ledger spam). Appends are **serialized under concurrency** via a mutex row
  (`mcp_chain_lock`): the read-tail→write is protected by a Postgres row-lock so
  simultaneous requests cannot fork the chain (platformOS Liquid offers no advisory
  lock and `{% transaction %}` is READ COMMITTED).
- **Human-in-the-loop** — high-impact tools require operator approval; execution runs
  as the original principal, re-authorized.
- **Least leakage** — denials return a stable generic message; specifics go to the
  ledger, not the wire.
- **Bounded blast radius** — per-principal rate limiting; size and depth caps.

**Author responsibility — the engine is not a substitute for a careful tool.** The
planes above are automatic, but schema validation checks *shape, not meaning* — a
`maxLength:100` string still accepts `<img onerror=…>` or `'; DROP TABLE …` unless you
add a `pattern`. Injection is prevented only if the handler passes **typed GraphQL
variables** (never string-concatenation). Raw table-write tools bypass your app's
moderation/defaults/relationships — prefer **command mode**. And "authorized" is not
"safe to publish" — content-creating tools should be moderated (`status: pending`) or
gated (`requires_approval: true`). See **[docs/authoring-tools.md → Security
boundaries](./modules/mcp/docs/authoring-tools.md#security-boundaries--what-the-engine-does-not-do-for-you)**
for the full list.

---

## Testing

[Vitest](https://vitest.dev) suites (dev-only; not shipped in the module). They read url +
admin token from `.pos`, or `MCP_URL`/`MCP_TOKEN` env, and are **non-destructive** (they
seed their own principals/rows/pages via the deterministic fixtures, then clean up). The
live suites drive ONE instance and share mutable server state, so the runner is pinned to
**strictly serial, single-instance** execution (see `vitest.config.mjs`) — do not relax it.

```bash
npm ci            # once — installs vitest
npm test          # run all suites (npx vitest run)
npm run test:watch  # watch mode while developing

# or target one suite:
npx vitest run tests/conformance.test.mjs   # single-principal: transport, identity, discovery,
                                            # validation, prompts, execution, adversarial,
                                            # resources, rate-limit, ledger, malformed-input
npx vitest run tests/coverage.test.mjs      # MULTI-principal: tools/list scoping (leakage),
                                            # authz-deny, validation matrix, commit/rollback,
                                            # idempotency (+window), approval (queue/dedup/cap/
                                            # execute-as-principal/reject/expired/status-poll),
                                            # token revoke + allowed_tools, rate-limit isolation,
                                            # abuse (suspend/window/unknown-tool), ledger
                                            # tamper-evidence, and the WEB console flows
npx vitest run tests/eval.test.mjs          # tool-surface eval: description quality, no-poison,
                                            # uniqueness, golden-case tool-exists + args-valid
npx vitest run tests/lint-tools.test.mjs    # static tool linter (LINT_STRICT=1 fails on warnings)
```

The tool linter is also a standalone, dependency-free CLI (no instance needed):

```bash
node tests/lib/lint-tools.mjs [--strict] [--json]   # injection/SSRF/ledger-write, schema
                                                     # correctness, content hardening, hygiene
```

`conformance.mjs` and `coverage.mjs` run against **deterministic, id-stable fixtures**
(`tests/seed/seed.mjs` — the single source of truth): fixed users in a reserved id range
(90100+), each with a **known** bearer token (only its sha256 digest is seeded) and, where
relevant, an `mcp_access` row — one dedicated user per stateful plane so no test inherits
another's suspend/abuse state (no shared-state `revive`). The fixtures are seeded via
platformOS `import_users` / `import_models` with `_id_remap:false` (the numeric ids are
preserved on every run); each suite calls `applyReset()` at start, which **re-imports to
baseline** (upsert) so local re-runs are repeatable **without a `data clean`**. No runtime
`user_create`, no `randomBytes`. Fixtures are never deleted (a deleted fixed id can't be
re-imported) — only their properties are reset.

For **deploy-time** seeding, `tests/seed/generate_migrations.mjs` emits a byte-deterministic
migration (`app/migrations/…_seed_mcp_test_fixtures.liquid`) **gated on the
`MCP_SEED_TEST_FIXTURES` constant** — a plain deploy leaves it unset (no fixtures land);
the published module ships zero migrations. Regenerate it only when the seed changes:
`node tests/seed/generate_migrations.mjs`.

`coverage.mjs` drives its fixture users (operator / member / outsider / requester + dedicated
rate/abuse/validator/conformance principals) against a set of **gated test tools** registered
only when the `MCP_ENABLE_TEST_TOOLS` constant is set (never in a production deploy). Its
assertions read real ledger / table / approval-queue state, so a broken plane fails them —
e.g. an approved action's row must be owned by the *original* principal, and a rolled-back
write must leave *no* row. The tools are community-free and write only to a host `test_note`
table. In the monorepo CI (`.github/workflows/tests.yml`, module key `mcp`) the static gates
(`npm run test:static`) and the live suite (conformance + coverage + eval) run against an
ephemeral instance reserved from the CI pool.

The test **`app/` is a minimal MCP harness**, not a full community app: it holds only the
Layer-2 tools (`app/views/partials/mcp/`), their queries (`app/graphql/mcp/`), the
`test_note` table, the seed migration, and `config`/`user.yml`. The community domain the
demo tools wrap comes from the `community`/`components` modules, installed from the
marketplace (`pos-cli modules install --dev`, gitignored); base `user` provides login.
Deploy the harness with `pos-cli deploy ps`.

The **tool linter** statically analyzes every tool's manifest + handler + query
(including unregistered drafts) and catches the author-responsibility issues the
runtime meta-schema can't — GraphQL/partial injection from `arguments`, SSRF via
external calls, ledger writes from handlers, `records_delete_all`, invalid/ReDoS
patterns, bound contradictions, `mutating` mislabeling, PII in `audit_fields`, and
per-field-kind content hardening (a display field is told to reject HTML, a URL field
is warned about `javascript:` URIs, a date field is told to add `format: date-time`).
Errors fail; `--strict` fails on warnings too. See
[docs/authoring-tools.md → Lint your tools](./modules/mcp/docs/authoring-tools.md#lint-your-tools).

The **eval harness** (`prompts §19.3`) stores golden cases (`mcp_eval_case`) and run
results (`mcp_eval_run`) as records; the deterministic checks catch tool-surface
regressions (missing/duplicate/poisoned descriptions, stale golden cases, malformed
golden calls). The module never calls LLMs; the LLM-driven tool-selection eval is a
documented hook in `eval.mjs`.

---

## Requirements

platformOS instance with the **`user`** module (session login for the operator pages),
plus `community` and `components` as declared in `pos-module.json`.
The engine uses only platform primitives: `digest: 'sha256'`, `transaction`/`rollback`,
`jwt_decode`, `response_status`/`response_headers`, records, constants, and `pos-cli
generate` for the scaffolder.
