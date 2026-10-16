# pos-module-mcp: what to fix before the first release

Scope: the monorepo version, `/home/ecgtheow/Work/modules/pos-modules/pos-module-mcp` (branch `mcp-module`, commit `6648251`). Checked on 2026-10-09.

**Criterion.** Fix it before release if fixing it later would break someone who already uses the module. That covers stored data, the manifest/handler/policy contract, config keys, permission and role names, and responses clients depend on. I added a second category: things that are not "breaking later" but cause harm or false claims from day one, such as security gaps, packaging side effects and wrong UI text. Everything else can wait.

Paths below are relative to `modules/mcp/public/` unless they start with `app/`, `tests/` or `pos-module.json`. `engine/` means `modules/mcp/public/lib/commands/`.

How claims were checked:
- **Code**: I read the file in the monorepo version.
- **Spec**: the official MCP specification pages, linked at the end.
- **Docs**: platformOS documentation.
- **SDK**: source of the reference TypeScript MCP client (main branch).
- **Not verified**: needs a live instance or test.

---

## Summary

| # | Item | Category | Effort |
|---|---|---|---|
| A1 | Turn off the "2026-07-28" protocol layer: it does not match the final spec | Must fix: wire contract | S |
| A2 | Add a version field to the ledger hash format | Must fix: stored data | S |
| A3 | Settle error codes and HTTP statuses on `/mcp` | Must fix: wire contract | M |
| A4 | Enforce `timeout_ms` now, or drop its 5 s default | Must fix: behaviour | S–M |
| A5 | Decide whether a token keeps working after its user loses MCP access | Must fix: security semantics | S |
| A6 | Reserve the `mcp_` prefix for built-in tool and policy names | Must fix: author contract | S |
| A7 | Remove config keys that do nothing or break things (`endpoint_path`, `oauth.issuer`, `oauth.audience`, `ledger.retention_days`) | Must fix: config contract | S |
| A8 | Reject unsupported JSON-Schema `format` values at manifest load | Must fix: author contract | S |
| A9 | Remove `community` / `components` from runtime dependencies | Must fix: packaging | XS |
| B1 | Test the OAuth server | Must fix: security | M–L |
| B2 | Re-check token and permissions when an approved action runs | Must fix: security | S |
| B3 | Require `redirect_uri` on the token request when it was sent to `/authorize` | Must fix: spec | XS |
| B4 | Fix the console's "Remove access" confirmation text | Must fix: wrong UI | XS |
| B5 | Answer `GET /mcp` with 405 | Must fix: spec | XS |
| B6 | Document OAuth and RBAC; fix wrong docs | Must fix: docs | M |
| C1–C8 | Freeze names and defaults (no or tiny code change) | Decide and document | XS each |
| D1–D12 | Additive features | Later | — |

Effort: XS < 1 h, S ≈ ½ day, M ≈ 1–2 days, L ≈ 3+ days.

---

## A. Must fix before release: later changes would break adopters

### A1. Turn off the 2026-07-28 protocol layer

**Problem.** The module advertises 2026-07-28 support, but the final spec differs in ways clients can detect:
- `initialize` `_meta.supportedProtocolVersions` and `/mcp-health` `protocols_supported` both list it (`engine/config.liquid:43`, `engine/rpc/initialize.liquid`).
- A client that asks for that version gets behaviour that does not match the final spec.

**Spec (2026-07-28 changelog) vs. code:**

| 2026-07-28 spec | Module |
|---|---|
| Version is sent in `_meta` key `io.modelcontextprotocol/protocolVersion` | Reads `_meta.protocolVersion` (`engine/protocol/negotiate.liquid`) |
| Servers **MUST** implement `server/discover` | Not implemented (grep: no match) |
| Every result carries `resultType` | Never set (grep: no match) |
| `cacheScope` is `"public"` or `"private"`, required on lists, `resources/read` **and `resources/templates/list`** | Sends `"shared"` / `"per-principal"`, and nothing on templates/list (`engine/protocol/cache_hint.liquid`, `engine/rpc/dispatch.liquid`) |
| `ping` and `logging/setLevel` removed | Still served for 2026 clients |
| Resource not found is `-32602` | `-32002` (`engine/rpc/resources_read.liquid`) |
| Header mismatch is `HeaderMismatchError -32020` | `-32600` (`engine/rpc/dispatch.liquid`) |
| Tasks extension: advertised under `capabilities.extensions`; `CreateTaskResult` with `resultType:"task"`, `ttlMs`, `pollIntervalMs`; cancel with `tasks/cancel`; `tasks/update` carries `inputResponses`; a task is returned only if the client declared the extension | Puts `io.modelcontextprotocol/tasks` as a top-level capability key; returns an ordinary result with a `taskId` in `structuredContent`; uses `tasks/update` with `status:"cancelled"` to cancel; adds `taskId` for every client |

**Why now.** Once released, any client or integration that negotiates 2026-07-28 depends on these responses. Correcting them later breaks those clients.

**Fix.** Advertise only `2025-06-18` (`supported_protocol_versions`). Remove the 2026-only paths: `tasks/*` routing, cache hints, the Tasks capability, and the `taskId` key in the pending-approval result (keep `handle`). Implement 2026-07-28 properly later (D2).

Note: `Mcp-Method` / `Mcp-Name` reconciliation can stay. For 2025-06-18 clients it only rejects contradictory headers.

### A2. Version the ledger hash format

**Problem.** `entry_hash = sha256(canonical(payload) + prev_hash)`. `canonical` is a fixed list of 22 fields (`engine/ledger/canonical.liquid:25-35`). No field records which format a row was hashed with.

**Why now.** Any later change to the canonical format re-hashes old rows differently, so `verify_chain` reports a break at the first existing entry on every instance. Examples: adding `token_id`, `scope` or `token_kind` (OAuth now makes these relevant), or changing timestamp precision. The only way around it without a version is to hard-code a cutover seq per instance.

**Fix.** Add a `canonical_version` (e.g. `1`) property to `mcp_ledger`. Write it on every append, include it in the canonical payload, and make `canonical`/`verify_chain` choose the field list by version. Doing this before any real ledger exists costs nothing.

### A3. Settle error codes and HTTP statuses on `/mcp`

**Problems:**
- **Rate limit uses `-32002`** (`engine/rpc/tools_call.liquid`), which 2025-06-18 defines as "Resource not found". The module also uses `-32002` for real resource-not-found and for task-not-found, so clients cannot tell them apart. (Spec: resources page, Error Handling.)
- **Invalid arguments are a protocol error** (`-32602`, HTTP 400). Since 2025-11-25 the spec says "input validation errors should be returned as Tool Execution Errors rather than Protocol Errors to enable model self-correction" (SEP-1303). The module's own goal for `validation_errors` is that self-correction.
- **Non-200 HTTP statuses on JSON-RPC errors.** The module returns 400, 403 (`Forbidden`, `Access suspended`), 409 and 429. In the reference TypeScript client (SDK, main branch):
  - Any non-OK POST except 401 and 403 `insufficient_scope` is **thrown as an HTTP error** (`SdkHttpError`, "Error POSTing to endpoint: …").
  - A 400 is passed through as a JSON-RPC error only for "modern enveloped" (2026) requests.
  - So a 2025-06-18 client sees an HTTP failure, not the typed JSON-RPC error with `data`.

**Why now.** Integrators and agents branch on these codes and statuses: retry on 429 + `Retry-After`, treat 409 as idempotency conflict, read `data.validation_errors`. Changing them later breaks that logic.

**Fix:**
- Keep **401** (required by the authorization spec) and **403 + `insufficient_scope`** (step-up auth).
- Return every other JSON-RPC error with **HTTP 200**.
- Give the rate limit its own code in the implementation-defined range (2026 policy: `-32000`…`-32019`), e.g. `-32005`, and keep `Retry-After` in `error.data` as well as the header.
- Return argument-validation failures as a tool result with `isError: true` and `structuredContent.validation_errors`. Keep "Unknown tool" as `-32602`, as the spec examples do.
- Update tests and `request-flow.md` to match.

### A4. `timeout_ms`: enforce now or drop the default

**Problem.** The `defaults.timeout_ms = 5000` config default and the manifest `timeout_ms` field are type-checked and shown in the console, but never enforced (`engine/execute/run.liquid` has no timeout).

**Facts (Docs).** platformOS `{% transaction timeout: N %}` exists. N is in seconds; "if the transaction takes longer than this time, it will be aborted and everything will be rollbacked". The module already uses it in `ledger/append`.

**Why now.** If enforcement arrives later with the 5 s default, every existing mutating tool that takes longer starts rolling back. That is a behaviour break for working installations.

**Fix, option 1 (enforce now):**
- Wrap the mutating branch in `transaction timeout:` using the manifest value, or the default when the manifest has none.
- Decide whether read tools also run inside a (read-only) transaction to get the same limit.
- **Not verified:** how an aborted transaction surfaces in Liquid (exception vs. silent abort). This needs a live test, so the module answers with a tool error and a `rolled_back` ledger entry rather than a 500.

**Fix, option 2 (defer):**
- Make the default "no limit" (remove `defaults.timeout_ms`).
- Document the manifest field as reserved.
- Enforce later as opt-in only.

### A5. Should tokens stop working when the user loses MCP access?

**Problem.** `identity/resolve_principal` checks only the token row (status, expiry, audience). It does not check that the user still holds `mcp.tokens.manage`.
- Removing access through the console revokes tokens (`access/set_role` → `tokens/revoke_for_user`).
- Removing the role any other way does not: profile edit, a user-module admin, demoting a superadmin, deleting the user. Manual tokens then keep working forever, and OAuth refresh keeps renewing for 30 days (`engine/oauth/token_refresh.liquid` doesn't check permissions either).

**Why now.** Adding the check later would suddenly disable tokens that adopters rely on (e.g. integrations owned by accounts without the role). The security semantics must be fixed at release.

**Fix.** In `resolve_principal`, after the token checks, call `modules/mcp/queries/principal/can` with `do: cfg.oauth.required_permission` and deny with reason `permission_revoked`. Do the same in `token_refresh`. Cost: one profile lookup per authenticated request; measure it against the existing per-request queries.

### A6. Reserve the `mcp_` prefix for built-in names

**Problem:**
- `registry/build` reserves only the exact name `mcp_approval_status`.
- `authorize/evaluate` handles the policy name `mcp_authenticated` before looking for app policy files. An app policy with that name is silently ignored.

**Why now.** Each future built-in tool or policy would silently exclude or shadow an adopter's identically named tool or policy.

**Fix.** Exclude app tools and policies whose name starts with `mcp_` from the registry and authorization. Add a linter error for it. Document the rule.

### A7. Remove config keys that do nothing or break things

| Key | Actual effect (code) | Risk if released |
|---|---|---|
| `endpoint_path` | Changes only the advertised resource id (`config.liquid:150`). The page slug is fixed at `mcp` (`views/pages/mcp.json.liquid`), as is `/.well-known/oauth-protected-resource/mcp`. | Setting it advertises a URL that doesn't exist. OAuth tokens are bound to the advertised resource, so changing it later invalidates every grant (`wrong_audience`). |
| `oauth.issuer` / `MCP_OAUTH_ISSUER` | Turns off the built-in OAuth server and advertises the external issuer (`config.liquid`, `protected_resource_metadata.liquid`). `resolve_principal` has **no external-token validation**, so that issuer's tokens are rejected as unknown. | Setting it locks every OAuth client out. |
| `oauth.audience` / `MCP_OAUTH_AUDIENCE` | Read in `config.liquid:124`, used nowhere (grep). | Misleading. |
| `ledger.retention_days` | Displayed in the console only. | Implies retention exists. |
| `defaults.timeout_ms` | See A4. | — |

**Why now.** Once adopters set these keys, removing or redefining them later changes their instance's behaviour.

**Fix.** Remove them from the config defaults, README and console. Reintroduce each one when it is actually implemented (D4 external issuer, D5 retention).

### A8. Reject unsupported `format` values

**Problem.** `registry/validate_schema_node` allows any `format` value. `validate/json_schema` enforces only `uuid`, `email` and `date-time` and silently ignores others (`uri`, `date`, `ipv4`, …). This contradicts the module's own rule in that file: "an implementer must never be able to declare a constraint the module does not enforce". The linter only warns.

**Why now.** There are two ways to fix it later, and both break someone:
- Rejecting unknown formats at load removes existing tools from the registry.
- Starting to enforce new formats rejects arguments that used to pass.

**Fix.** At load, reject any `format` outside the three supported values, and make the linter rule an error. Enforcing more formats later then only affects tools that opt in.

### A9. Remove `community` and `components` from runtime dependencies

**Problem.** `pos-module.json` `dependencies` lists `community ^1.6.9` and `components ^1.1.7`. The engine doesn't reference them: the CI guard in `tests/ci-static.sh` allows only `modules/mcp` and `modules/user`, and I re-ran it. Only the demo tools in `app/` use them.
- Installing the published module would install `community` on every customer instance. In the prototype's copy, that module ships 112 page files (e.g. `/dashboard`, `/about-us`, `/faq`, `/privacy-policy`) and 8 schema files.

**Fix.** Move both to `devDependencies` (where the harness gets them via `pos-cli modules install --dev`) and update the lock file. Note: this is harmful from day one rather than "breaking later", so fix it first.

---

## B. Must fix before release: security, spec, or wrong information

### B1. Test the OAuth server

About 1,700 lines of credential-issuing code with **no test** (grep in `tests/`: only the existing protected-resource metadata check). A defect here produces long-lived credentials: refresh tokens last 30 days. Minimum suite, in `tests/` against the live instance:
- **Discovery:** both metadata documents.
- **Authorize:** anonymous user → sign-in redirect; user without permission → `access_denied`; consent approve and deny; `state` and `iss` returned.
- **Code exchange:**
  - PKCE: missing or `plain` → error; wrong verifier → `invalid_grant`, and the code is used up.
  - Code reused → `invalid_grant`.
  - Expired code; wrong `client_id`; wrong `redirect_uri`; `resource` mismatch → `invalid_target`.
- **Refresh:** rotation works; reusing the previous refresh token revokes the grant; wrong `client_id`.
- **Using tokens on `/mcp`:**
  - Expired access token → 401 `token_expired`.
  - Token issued for another resource → 401 `wrong_audience`.
  - `mcp:read`-only token on a mutating tool → 403 `insufficient_scope` with the challenge header.
- **DCR:** bad redirect URIs (`javascript:`, http on a non-loopback host, fragment); rate limit.
- **CIMD:** the URL guard (`public_https_url`) as unit-style calls via `liquid-exec`.
- **Revoke:** only works for the matching `client_id`.

Also verify on the platform whether `api_call_send` **follows HTTP redirects**. If it does, a public URL that redirects to an internal address bypasses the SSRF host check. **Not verified.** If it does follow them, disable redirects or reject 3xx responses.

### B2. Re-check token and permissions when an approved action runs

`approval/execute` looks the tool up with `allowed_tools: null` and checks only the tool's policy, rebuilding the principal from the stored id. It does not check:
- that the requesting token is still active (it might have been revoked or suspended since);
- that it was allowed that tool;
- that the user still holds the permission (see A5).

An operator approval can therefore run an action for a revoked identity. **Fix:**
- Store `token_id` on `mcp_pending_approval`.
- At execution, re-load the token and require `status == active` and the tool in `allowed_tools`.
- Require `mcp:write` for mutating tools, plus the A5 permission check.
- Otherwise fail with an outcome like "Requester's access was revoked."

Doing it now also avoids later changing why approvals fail.

### B3. Require `redirect_uri` on the token request

`engine/oauth/token_authorization_code.liquid` compares `redirect_uri` only when the client sends it. OAuth 2.1 requires it on the token request when it was part of the authorization request. PKCE limits the impact, but it is a one-line fix.

### B4. Fix the console's "Remove access" text

The confirmation says "Their existing tokens stay active until revoked above" (`views/pages/mcp-admin.liquid`, member list). `access/set_role` with a blank role actually revokes them all, and the coverage test asserts it. Change the text to say every token is revoked.

### B5. Answer `GET /mcp` with 405

2025-06-18 Streamable HTTP: the server **MUST** answer GET with an SSE stream or 405. There is no GET page, so the platform returns 404. The reference client treats 405 on the GET stream as benign but reports any other status through `onerror` (SDK). Add a `slug: mcp, method: get` page returning 405 with `Allow: POST`.

### B6. Documentation

**Missing:**
- The OAuth server: endpoints, consent, scopes, config keys, which clients it targets, and the SSRF and DNS-rebinding notes.
- The RBAC setup (README partly covers it): the host app **must** define `mcp_user` / `mcp_operator` in its permissions override, otherwise only superadmins can use the consoles. `can_do` logs a warning for undefined roles and grants nothing.

**Wrong:**
- `backlog/decision-4` is cited in the code but doesn't exist.
- `public_https_url` cites "security-model §2.5", which is about denial messages.
- `engine-commands-architecture.md` has the wrong gate order.
- The launch article (resources "rate-limited" and on at install, on-behalf-of "first-class", "immutable" ledger) needs correcting.
- `spec-2026-07-28-gap.md` is wrong after A1.
- The CHANGELOG lacks the OAuth server.

### Resolved since the earlier report (no action)

`create_event` starts a background job inside the transaction. The platformOS transaction docs say a job scheduled inside a transaction "will only be added to the queue after successfully committing the transaction", so a rollback never queues it. The open item from the comparison report is closed. (External `api_call_send` inside a handler is still not rolled back; the authoring rule covers that.)

---

## C. Decide and document now

These need no code change, or a trivial one. They become contracts at release.

| # | Item | Current value (code) | Recommendation |
|---|---|---|---|
| C1 | Permission and role names | `mcp.tokens.manage`, `mcp.admin`; roles `mcp_user`, `mcp_operator` (adopters copy them into their permissions override) | Confirm final; never rename. |
| C2 | OAuth scope names and meaning | `mcp:read` (always granted), `mcp:write` (mutating tools). Manual tokens carry both. | Confirm final. New scopes can be added later. |
| C3 | `challenge_initialize` default | `false`: discovery stays open; a client only sees 401 on `tools/call` | Test Claude.ai and ChatGPT connectors **before** release and pick the default. Flipping it later breaks clients that connect without a token. |
| C4 | `tools_list_scope` default | `open` | Keep or change now. Flipping later changes what clients see. |
| C5 | Policy return contract and inputs | `true` or `{allow, reason}`; inputs `principal{id,user_id}`, `agent{id,client_id,registered,allowed_tools}`, `arguments`, `tool`, `delegation_mode` | Freeze; only add fields later. Consider adding `token_kind` and `scopes` now so policies can use them. |
| C6 | Handler contract | `{ok, result, subject{type,id}, error{message,fields}}`; inputs include `context_meta{tool_name,tool_version,request_id}` | Freeze; only add fields later. |
| C7 | Identifiers that get stored | Principal id `user:<id>`; approval statuses `pending, approved, executed, rejected, cancelled, expired, failed`; resource URI `mcp+page:///<slug>`; token prefixes `mcp_`, `mcp_at_`, `mcp_rt_`, `mcp_ac_` | Freeze. |
| C8 | Idempotency key location | `params._meta.idempotencyKey`, with a fallback to `params.idempotencyKey` | Keep only `_meta` (the fallback is non-standard), or document both as permanent. |

---

## D. Can be done after release (adding them breaks nothing)

| # | Item | Why it is safe later |
|---|---|---|
| D1 | Write `audit_fields` into `audit_json` | `audit_json` is already in the hash format; old rows stay null. Until then, say in the docs that the field is accepted but not yet recorded. |
| D2 | Proper 2025-11-25 and 2026-07-28 support (`server/discover`, `resultType`, `_meta` keys, Tasks extension, cache hints) | Additive once A1 removes the wrong version. |
| D3 | Manual token expiry | Optional field; blank = no expiry, as today. |
| D4 | External authorization server (JWT validation) | New, opt-in config. |
| D5 | Ledger and approval retention/purge | Needs a design: deleting old ledger rows breaks full-chain verification unless checkpoints are kept. Nothing depends on it today. |
| D6 | Write admin actions to the ledger (approve/reject decisions, role changes, token revokes, OAuth grants) | New `method` values; the hash format is unchanged. A2 makes later format changes safe too. |
| D7 | On-behalf-of delegation | Contract already carries `delegation_mode`. |
| D8 | Origin header validation (2025-06-18 "MUST" for DNS rebinding) | Low risk for a remote server with bearer auth; add with an allow-list so browser clients aren't blocked. |
| D9 | Rate limits on `resources/*` and `tasks/*` | Additive (generous limits). |
| D10 | Excluding markdown pages that carry page-level authorization policies from resources | Resources are off by default and limited to markdown GET pages. **Not verified:** whether `admin_pages` exposes the page's policies; check before relying on it. |
| D11 | Canonical (key-sorted) argument hashing for `input_sha256` | Only affects 24-h idempotency and duplicate-approval matching; the ledger stores the value and never recomputes it. |
| D12 | Linter coverage (inline `{% graphql %}` with interpolation), more built-in tools, manual-token scopes, a UI for `allowed_tools` | Additive. |

---

## Not verified / needs a live instance

- How an aborted `transaction timeout:` surfaces in a page (A4).
- Whether `api_call_send` follows redirects (B1).
- Real hosted clients (Claude.ai, ChatGPT connectors) against the OAuth flow, and the `challenge_initialize` default (C3).
- The cost of the per-request permission check (A5).

## Sources

- MCP 2025-06-18 resources, error handling (`-32002` resource not found): https://modelcontextprotocol.io/specification/2025-06-18/server/resources
- MCP 2025-06-18 tools, error handling: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- MCP 2025-11-25 changelog (SEP-1303 validation errors as tool errors; SEP-835 scope step-up; CIMD): https://modelcontextprotocol.io/specification/2025-11-25/changelog
- MCP 2026-07-28 changelog (`server/discover`, `resultType`, `_meta` keys, `cacheScope` public/private, `-32602` resource not found, `-32020` header mismatch, Tasks extension, DCR deprecated): https://modelcontextprotocol.io/specification/2026-07-28/changelog
- MCP Tasks extension: https://modelcontextprotocol.io/extensions/tasks
- Reference TypeScript client, `streamableHttp.ts` (main): https://github.com/modelcontextprotocol/typescript-sdk
- platformOS `transaction` tag (timeout; background jobs queued after commit): https://documentation.platformos.com/api-reference/liquid/platformos-tags#transaction
