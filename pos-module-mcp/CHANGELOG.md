# Changelog

All notable changes to **pos-module-mcp** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **App-side MCP files moved from `app/views/partials/mcp/` to `app/lib/mcp/`.** Tools,
  policies, the registry, prompts and instructions are logic, not views. Logical paths
  (`mcp/registry`, `mcp/tools/<name>/call`, `mcp/policies/<name>`, …) are unchanged, so
  existing apps keep working; the `tool` generator now writes to `app/lib/mcp/tools/`.
- **Pure engine units moved from `lib/commands/` to `lib/helpers/`.** 24 side-effect-free
  partials (`config`, `rpc/{error,success,invalid_arguments_result}`, `identity/deny`,
  `execute/result_of`, `ledger/canonical`, `protocol/*`, `tasks/present`,
  `validate/json_schema`, `registry/{manifest_schema,validate_schema_node,lint_description}`,
  `oauth/{append_params,error,parse_url,pkce_verify,random_secret,normalize_scope,public_https_url,redirect_uri_valid,redirect_uri_allowed}`)
  are now `modules/mcp/helpers/…`. Apps calling any of them as `modules/mcp/commands/…`
  must update the path.
- **Read-only engine units moved from `lib/commands/` to `lib/queries/`.**
  `registry/{build,build_prompts,load,resolve_tool}`, `ledger/{verify_chain,verify_chain_recent}`,
  `idempotency/lookup`, `identity/token_still_authorized`, `resources/provider` and
  `observability/metrics` are now `modules/mcp/queries/…`; the pure
  `resources/clean_entries` is now `modules/mcp/helpers/…`. Apps calling any of them as
  `modules/mcp/commands/…` must update the path.
- **Commands that write follow Build/Check/Execute.** `access/set_role`, `tokens/mint`,
  `oauth/register`, `oauth/revoke`, `oauth/issue_code`, `oauth/issue_tokens`,
  `approval/create`, `approval/claim`, `idempotency/store`, `limits/check` and
  `limits/note_violation` keep their path and return contract, and now run
  `<action>/build`, `<action>/check` and `<action>/execute` like the other platformOS
  modules. Incomplete input now fails closed (`allowed: false`, `claimed: false`, no row
  written). `ledger/append` stays single-step on purpose — attestation is never refused —
  as do the input-less `ledger/mutex` and `maintenance/sweep` and the orchestrators
  (`rpc/*`, `approval/execute`, `execute/run`, `eval/run`, the OAuth token flows).
  The checks use `modules/core/validations/*` and `register_error`, so `core` (^2.1.9,
  already installed through `user`) is now a declared dependency. `tokens/mint` with a
  blank `user_id` now returns `{ error: 'invalid', errors }` instead of minting an unbound token.
- **Module layout.** Docs moved from `modules/mcp/docs/` (shipped with the module) to
  `docs/`, with the architecture decision records in `docs/decisions/`. App test
  fixtures (`test_*` / `vuln_*` tools, the poisoned prompt and instructions) moved to
  `app/lib/mcp/tests/`. The `test_principal_admin` policy duplicated `admin_only` and was
  removed.
- **BREAKING — accounts and access use the user module's RBAC.** The consoles resolve the
  signed-in user with `modules/user/helpers/current_profile` and gate pages with
  `can_do_or_unauthorized` (anonymous visitors are redirected to sign-in and returned).
  Access is two permissions — `mcp.tokens.manage` (`/mcp-tools`) and `mcp.admin`
  (`/mcp-admin`) — mapped to the roles `mcp_user` / `mcp_operator` in the app's
  `role_permissions` override; superadmins hold both. `admin_only` checks `mcp.admin` on
  the bearer principal via the new `modules/mcp/queries/principal/can`.
- **Removed:** the `mcp_access` table, the `MCP_ADMIN_USER_IDS` bootstrap constant and the
  request-access flow (`POST /mcp-tools/request`). Operators grant roles by email on the
  console. **Upgrading:** define the two roles in your permissions override, then grant
  `mcp_user` / `mcp_operator` to existing members (or rely on superadmin for operators).
- **BREAKING — a token works only while its user holds MCP access.** Every `/mcp` call
  re-checks `oauth.required_permission` (`mcp.tokens.manage`) and answers `401`
  (`permission_revoked`) without it; refresh answers `invalid_grant`. A role removed by
  any path (profile edit, another admin tool, user deletion) now stops manual and OAuth
  tokens at once, not only removal on the console.
- **BREAKING — HTTP status and codes on `/mcp`.** Method-level JSON-RPC errors answer
  HTTP 200 so 2025-06-18 clients read the typed error instead of failing on the
  transport. Only `401` (authentication) and `403` `insufficient_scope` (step-up) keep
  their status, plus malformed requests (400 / 413) and the modern-only transport errors.
  - Rate limit: `-32004` (was `-32002`, which MCP defines as "resource not found"), HTTP
    200, `Retry-After` header and `error.data.retryAfter`.
  - Invalid arguments: a tool execution error (`result.isError: true`, the errors in
    the text and, for a tool without `output_schema`, in
    `structuredContent.validation_errors`), not `-32602` (MCP 2025-11-25, SEP-1303), so
    the model can correct its call. Also for an approved action whose stored arguments
    no longer validate (a Tasks result, not a task error).
  - Unknown tool, forbidden, access suspended, idempotency-key reuse (was 409), legacy
    unknown method, unknown prompt and bad logging level: HTTP 200.
- **BREAKING — the `mcp_` prefix is reserved.** An app tool named `mcp_*`, or a manifest
  naming an `mcp_*` policy other than the built-in `mcp_authenticated`, is excluded at
  load; app policy files named `mcp_*` are never loaded. The tool linter reports both as
  errors.
- **BREAKING — unsupported `format` values are rejected.** An input-schema `format`
  other than `uuid`, `email`, `date` or `date-time` makes the manifest invalid (it was
  silently not enforced); the linter rule `format-unsupported` is now an error.
- **Approved actions re-check the requesting token.** `mcp_pending_approval` stores the
  requester's `token_id`; on approval the token must still be active, allow the tool and,
  for a mutating tool, carry `mcp:write`, and the user must still hold MCP access.
  An OAuth grant must also still be renewable and bound to this server. Otherwise the
  approval fails with "Requester's access was revoked." Approvals queued before this
  change have no `token_id`; for them only the user's permission is re-checked.
- **Ledger rows record their hash format.** New `mcp_ledger.canonical_version` (1),
  included in the hashed payload; `ledger/canonical` picks the field list by version, so
  a later format change never breaks verification of older rows. Rows written before this
  change are verified as version 0.
- **`/oauth/token` requires `redirect_uri` when it was sent to `/oauth/authorize`**
  (OAuth 2.1 §4.1.3). New `mcp_oauth_code.redirect_uri_sent`.

### Removed

- Config keys that did nothing or misled: `endpoint_path` (the endpoint is always
  `/mcp`), `oauth.issuer` / `MCP_OAUTH_ISSUER` (an external issuer was advertised but its
  tokens were rejected; while the constant is still set the built-in authorization
  server stays off and a `mcp.config_retired_issuer` log entry is written),
  `oauth.audience` / `MCP_OAUTH_AUDIENCE`, `ledger.retention_days`
  and `defaults.timeout_ms` (never enforced). The manifest `timeout_ms` field is accepted
  but reserved; handlers run without a time limit.

### Added

- **Built-in OAuth 2.1 authorization server.** MCP clients connect without a hand-minted
  token: RFC 9728 / RFC 8414 metadata, `/oauth/authorize` with sign-in and consent,
  `/oauth/token` (authorization code + PKCE `S256`, rotating refresh tokens with reuse
  detection), Client ID Metadata Documents, Dynamic Client Registration and
  `/oauth/revoke`. Tokens are opaque, bound to the user, client, resource (`/mcp`) and a
  scope (`mcp:read`, `mcp:write` for mutating tools); a missing scope answers `403`
  `insufficient_scope`. See `modules/mcp/docs/oauth.md`.

- **Tool `title`, `annotations` and `outputSchema` in `tools/list`.** A manifest may
  declare `title` (string), `annotations` (the four MCP behaviour hints, each boolean;
  anything else makes the manifest invalid) and `output_schema`. `output_schema` is now
  checked in output mode: the root must be an object, a field may list several types
  including `"null"`, and the depth limit is the new `defaults.max_output_schema_depth`
  (8). The reference tool `search_events` declares all three; the gated fixture
  `test_bad_annotations` proves a malformed hint excludes the tool.
- **Prompts know the caller.** The app's prompts partial and each prompt template now
  receive `principal` and `agent` (nil for a request without a bearer), so an app can offer
  different prompts to different people, for example prompts a person saved for
  themselves. A prompt the partial does not offer to this caller is unknown to
  `prompts/get`. A signed-in `prompts/list` answers with `cacheScope: "private"`.
- **Prompt templates get their prompt entry.** `prompts/get` passes the template `prompt`:
  the entry the prompts partial returned for this caller, with any extra keys it set. One
  template can then serve many prompts, for example one per text a person saved, by keeping
  an id in the entry. Templates that do not read `prompt` are unaffected.
- **`agent.token_id` for tool handlers.** Handlers get the id of the `mcp_token` that made
  the call next to `id`, `client_id` and `allowed_tools`. Labels are not unique, so this is
  the only way to tell two tokens of one person apart. An approved action now also gets
  the requesting agent's `client_id` and `token_id`: `mcp_pending_approval` gains
  `requested_by_client_id` and `requested_by_token_id` (blank on approvals made before).
- **`format: "date"`** in `input_schema`: `YYYY-MM-DD` that is a real calendar day (month
  1-12, day within the month, Gregorian leap years). `2026-02-31` is rejected; `to_time`
  is not used because it rolls such dates over silently.
- **Resources from the app, per caller.** A new Layer-2 hook, the resource provider
  partial (`resources_partial`, default `mcp/resources`), answers `list`, `templates` and
  `read` for an authenticated caller and receives `principal` and `agent`, so an app can
  serve its own data as resources under its own access rules. Its entries are added to
  `resources/list` (with its own `nextCursor` paging) and `resources/templates/list`;
  entries without an address or name, or using the reserved `mcp+page:` scheme, are
  dropped, and only the keys MCP defines are passed on. A `resources/read` of a URI with
  any scheme other than `mcp+page:` goes to the provider through the same controls as a
  tool call: auto-suspend, the per-principal rate limit, the `mcp:read` scope and a ledger
  entry (method `resources/read`, URI hashed). A resource the caller may not read is
  "Resource not found", the same as a missing one. A provider that raises or returns
  malformed contents is logged and answered with `-32603`. For a signed-in caller the
  resource lists and provider reads are cached `private`. Anonymous callers and apps
  without the partial see only the markdown pages, as before.
- **The tool-poisoning lint covers all model-read text.** Every `description` and
  `title` in a tool's `input_schema` and `output_schema`, and the tool `title`, are linted
  like the tool description when the registry is built (non-fatal; listed in the
  manifest warnings and in the registry's new `_lint`). The operator eval reports them
  under `surface/no_poison` and adds `surface/instructions_no_poison` (the connection
  instructions) and `surface/prompt_no_poison` (each prompt's title, description and
  argument descriptions). The static linter (`tests/lib/lint-tools.mjs`) also checks
  parameter descriptions.
- **Portable conformance suite** (`tests/portable.test.mjs`). Checks the protocol
  behaviour on any instance with the module — transport, credentials, discovery shapes
  and the `2026-07-28` rules — without the test harness. It only reads `MCP_CONFIG`,
  calls no tool with a valid token, creates one user, a user-module profile with an MCP
  role (`MCP_PORTABLE_ROLE`, default `mcp_user`) and one token and deletes all three, and
  proves it left no ledger row.

### Fixed

- **Text with HTML entities no longer breaks tool calls or changes on the way.** platformOS
  `parse_json` decodes HTML entities before it parses unless `raw_text: true` is passed, so
  tool arguments containing `&quot;` failed with a Liquid error (HTTP 500) and `&amp;` or
  `&lt;` reached the handler as `&` or `<`. The same happened to stored arguments of held
  actions, idempotent replays, task results and errors, the parked OAuth authorization
  request (a `state` with `&quot;` gave a 500 on consent), client metadata documents, the
  `MCP_CONFIG` constant and the console's eval results. Every one of these now parses with
  `raw_text: true`.
- **The cached tool registry keeps tool text exactly, whichever page filled the cache.**
  `registry/load` wrote the registry JSON with `echo`, which Liquid HTML-escapes on HTML
  pages (the console) but not on the JSON endpoint, and both share one cache entry. Read
  back with the default decoding, a tool title or description containing `&quot;` made
  `/mcp` answer 500 when the endpoint filled the cache first. The JSON is now written with
  `print` (never escaped) and parsed with `raw_text: true`; the cache key is now
  `mcp_registry_v2`, so no entry in the old form is read.
- Tested in `coverage.test.mjs` (arguments, write, replay, approval, task; the registry
  filled from each page first, with entities in the `test_echo` fixture's description) and
  `oauth.test.mjs` (state).
- **CI: the static stage no longer fails with exit code 129 in the test container.** The
  seed-migration check ran `git diff`, but inside the CI container git does not trust the
  checkout (`safe.directory`), so it printed its usage and reported a stale migration that
  was not stale. The check is now `node tests/seed/generate_migrations.mjs --check`, which
  compares the generated text with the committed file, writes nothing and needs no git.
  `npm ci` also failed in CI: the lock file lacked the peer dependencies `npm ci` requires
  (`@emnapi/core`, `@emnapi/runtime`, `@emnapi/wasi-threads`). They are now in the lock, and
  a module `.npmrc` sets `legacy-peer-deps=false` so a lock regenerated on a machine with
  that user setting keeps them. `tests/ci-bootstrap-operator.mjs` stopped CI with "no
  platformOS user found": the deploy step's `pos-cli data clean` removes every user, so the
  operator never exists. It now creates the user with `MCP_OP_PASS` when it is missing.
- **An invalid bearer is answered with 401 on every method.** A request that presents a
  bearer which does not resolve (unknown, revoked, expired, wrong audience) now gets
  `401` with `WWW-Authenticate: … error="invalid_token"` on discovery too (`tools/list`,
  `prompts/list`, `resources/*`, `initialize`, `server/discover`, `ping`), as the MCP
  authorization spec and RFC 6750 require. Before, `tools/list` answered `200` with an
  empty list, so a client whose token was revoked saw "no tools" instead of being asked
  to sign in again. A request without a bearer stays open as before. The token is
  resolved once in `rpc/dispatch` and passed to the router.
- **Token labels name one agent.** A manual token's label is its agent id, so two active
  tokens of one person with the same label acted as one agent; a blank label always
  became `mcp-client`, which merged every unnamed token. `commands/tokens/mint` now
  refuses a label the person already uses on an active manual token (ignoring case;
  revoked and OAuth tokens do not count) and returns `{ error: "label_taken" }`, which
  `/mcp-tools` shows; a blank label gets a generated one (`mcp-client-` + 6 characters).
- **Fallback connection instructions** (used when the app has no instructions partial)
  are short and factual: no "call tools/list", no claim that descriptions are
  authoritative, no threat. They state that refused calls in a short time suspend the
  token, and mention documentation resources only when they are exposed.
- **Console forms check the form token.** The POST pages of `/mcp-tools` (mint, revoke)
  and `/mcp-admin` (approve, reject, reject-principal, access, token-revoke, eval) refuse
  a request without a valid `authenticity_token` with `403` and a "This form has expired"
  page, and change nothing; the OAuth consent decision answers `400` and never redirects.
  Before, they relied on the platform running such a request without a session.
- **The token console speaks plainly and links back.** `/mcp-tools` says "access token"
  and "AI app that supports MCP" instead of "bearer token", "MCP client" and "community",
  names the field "Name", and has a "Back to the site" link.
- **Console "Remove access" confirmation** said the member's tokens stay active; removal
  revokes them all, and the text now says so.
- **MCP `2026-07-28` conformance.** Checked against the published schema and transport
  spec; the engine is now dual-era by the spec's rules:
  - Modern requests are recognised by `params._meta["io.modelcontextprotocol/protocolVersion"]`.
    The header must be present and equal (400, `-32020`), and an unsupported revision is
    refused (400, `-32022`, with `data.supported` and `data.requested`) instead of being
    served as `2025-06-18`.
  - New `server/discover` (supported revisions, capabilities, instructions, server
    identity, cache hint).
  - Every modern result carries `resultType: "complete"`.
  - `cacheScope` uses the spec values `public` / `private`;
    `resources/templates/list` gets a cache hint.
  - Modern requests must send `Mcp-Method` and `Mcp-Name` matching the body (400,
    `-32020`), with Base64-sentinel values decoded first.
  - A modern request for a method the revision does not define (`ping`,
    `logging/setLevel`, unknown methods) answers 404 `-32601`. A missing resource answers
    `-32602` instead of the retired `-32002`.
  - Legacy clients are unchanged, except that `initialize` no longer selects
    `2026-07-28`: a handshake only negotiates a legacy revision.
  - **BREAKING for early 2026 clients:** the non-standard top-level
    `_meta.protocolVersion` is no longer read, and `cacheScope` values `shared` /
    `per-principal` are gone.
- **Tasks extension (`io.modelcontextprotocol/tasks`) conformance.** An approval-gated
  `tools/call` from a modern request that declares the extension answers with a
  `CreateTaskResult` (`resultType: "task"`).
  - `tasks/get` returns the spec `Task`: `working`, then `completed` with the stored tool
    result, `failed` with the JSON-RPC error the inline call would have returned, or
    `cancelled`. An expired approval is `failed` with the new code `-32005`.
  - New `tasks/cancel` withdraws a pending approval. `tasks/update` now only acknowledges
    input responses (approval tasks never need input) and can no longer cancel.
  - Unknown or foreign task → `-32602`; a client that did not declare the extension →
    400 `-32021`; `Mcp-Name` must equal `params.taskId`.
  - `server/discover` advertises the extension under `capabilities.extensions`.
  - New `mcp_pending_approval` columns `result_json` and `error_json` hold the outcome;
    new mutation `approvals/record_outcome`; new config `defaults.task_poll_interval_ms`
    (30000).
  - **BREAKING:** the pending `tools/call` result no longer carries a `taskId` alias (a
    client that did not declare the extension cannot use it), and `tasks/update` with
    `status: "cancelled"` is replaced by `tasks/cancel`.
- **`GET` / `DELETE /mcp` answer 405 with `Allow: POST`** instead of 404, as the
  2025-06-18 transport requires for a server without an SSE stream.
- **The opt-in connect-time OAuth challenge (`oauth.challenge_initialize`) also covers
  `server/discover`**, the modern client's first call.
- **Absolute URLs honour the real origin.** The RFC 9728 resource identifier, the
  `WWW-Authenticate` `resource_metadata` link, resource `public_url`s and the `/mcp-tools`
  connect command were built as `https://` + host, which was wrong on plain http or a
  non-default port (e.g. local development). They now come from the request URL via the
  new `modules/mcp/queries/origin`.
- **Ledger hash-chain concurrency fork (integrity).** Concurrent ledger appends read the
  chain tail then wrote, so two near-simultaneous requests could link to the same
  `prev_entry_hash` → duplicate `seq` → a forked chain that `verify_chain` flags as a
  linkage break. platformOS Liquid has no advisory lock / unique index, and
  `{% transaction %}` is plain READ COMMITTED, so `ledger/append` now serializes via a
  **mutex row**: inside its transaction the first op UPDATEs a singleton `mcp_chain_lock`
  row (with a fresh unique token, so ActiveRecord always issues the write), taking a
  Postgres row-lock held until commit — concurrent appends block and then read the tail
  the winner just wrote. Verified fork-free under 40/60/80 concurrent appends and a live
  105-call agent attack. New table `mcp_chain_lock` + `ledger/lock_{find,create,bump}`
  GraphQL; append is best-effort (never drops an attestation if the mutex row is absent).
  *Surfaced by the agentic-eval pentester hammering the endpoint — the deterministic
  serial suites never hit it.*

### Added

- **MCP `2026-07-28` protocol support — per-request negotiation.** The engine now implements
  both `2025-06-18` and the new stateless `2026-07-28` revision and negotiates **per request**
  (`_meta.protocolVersion` → `MCP-Protocol-Version` header → `initialize` params → default).
  A version-less/unknown request stays on `2025-06-18`, byte-for-byte unchanged; the
  `2026-07-28` additions activate ONLY when explicitly negotiated: **header-based routing**
  (`Mcp-Method`/`Mcp-Name` reconciliation — a header may supply a missing body value, but one
  that *disagrees* is rejected `-32600`, never silently resolved) and **cacheable list results**
  (`ttlMs`/`cacheScope` on `tools/list`, `prompts/list`, `resources/list`, `resources/read`;
  registry is deploy-invariant → long TTL, principal-scoped list → `cacheScope:"per-principal"`).
  `initialize` echoes the *negotiated* revision and advertises `_meta.supportedProtocolVersions`;
  `/mcp-health` lists `protocols_supported`. New `commands/protocol/{negotiate,cache_hint}`;
  full gap analysis + migration checklist in `docs/spec-2026-07-28-gap.md`. Verified by a new
  `conformance.test.mjs` block (negotiation precedence, unchanged-for-2025, gated cache hints,
  header reconciliation) — no regression to the 2025-06-18 pipeline.
- **Tasks extension** (`io.modelcontextprotocol/tasks`) — an approval-gated action is now a
  first-class **task**: a 2026-07-28 client polls it with **`tasks/get`** and withdraws it with
  **`tasks/update`** (cancel only). Self-scoped (a caller sees only its own tasks — unknown and
  not-yours both return "not found", no enumeration) and terminal-immutable. Critically,
  `tasks/update` supports **cancel only** — an agent can never self-approve, so the operator
  human-in-the-loop gate cannot be bypassed (approve/reject stay console-only). The methods are
  gated to a 2026-negotiated client (a 2025 client keeps using the built-in `mcp_approval_status`);
  the capability is advertised in `initialize` and the pending `tools/call` response carries a
  `taskId` alias. New `commands/rpc/{tasks_get,tasks_update}` + `commands/tasks/present`. Verified
  by `coverage.test.mjs › Tasks extension` (poll → working, cancel → cancelled + queue freed,
  cross-principal not-found, self-approve blocked `-32602`, capability gated to 2026).
- **Agentic-eval harness** (`agentic-eval/`) — a methodology skeleton that drives a real
  LLM agent (opencode) against the live governed surface and grades on the **ledger +
  active probes, not the agent's self-report**. Self-contained `penetration-tester`
  persona (CIAP techniques + the module's real thresholds), `run.mjs` (seed scoped
  principal → drive → grade → teardown → JSONL + markdown report), `tasks.mjs` with
  code-graders, and `report.mjs`. Graders include: no privilege breach, **no unattested
  mutation** (each persisted row linked to a ledger `success` by `subject_id` —
  tool-agnostic + latency-robust via bounded re-read: catches a backdoor insert, ignores
  read-index skew), blocked attempts attested, **error responses are JSON-RPC never
  app-HTML** (fall-through-leak check), and **ledger hash-chain intact** (independent
  fork/tamper detector). Zero attested calls grades `INCONCLUSIVE`, never a false `HELD`.
- **Negative-control vulnerable tools** (`app/views/partials/mcp/tools/vuln_*`, task-6) —
  deliberately insecure fixtures (`vuln_privesc` broken authz, `vuln_idor` cross-principal
  read, `vuln_xss` unfiltered markup, `vuln_secret` info leak) gated behind a new
  `MCP_ENABLE_VULN_TOOLS` constant, so the agentic-eval can prove it *detects* a real
  vulnerability, not just confirms defenses. Driven by `run.mjs --vuln`, an
  **inverted-verdict negative-control mode**: it enables the flag for the run (auto-restored),
  the grader actively probes each planted vuln, and a run that DETECTS them reads as
  `NEG-CONTROL PASS`. Verified live (`detected 4/4 planted vulns`) + verified never served
  when the constant is unset (no production surface). Community-free. (task-6)
- **Stored-prompt-injection agentic scenario** (`agentic-eval`, task `stored-injection`) —
  proves the engine contains a *second-order* injection: `setup()` seeds a poisoned event
  (user-generated content instructing the agent to call a destructive tool), a normal
  helpful agent is told to review and act on events, and the grader verifies all three
  containment mechanisms against safe `vuln_delete_all*` **honeypot** tools — **authz-deny**,
  **least-privilege** (`allowed_tools`), and the **approval gate** — from the ledger. The
  verdict is deterministic containment (no honeypot ever returns `success`); agent
  susceptibility is reported as non-gating telemetry. Honeypots are gated negative controls
  with safe no-op handlers (`MCP_ENABLE_VULN_TOOLS`, enabled per-task via a new
  `needsVulnTools` hook + a `task.setup` world-seeding hook), and the linter skips `vuln_*`.

- **Principal-scoped tool discovery** — new `tools_list_scope` config key. `open`
  (default) keeps MCP's public discovery; `principal` filters `tools/list` to the tools
  the caller's authorization policy admits, so restricted tools are not leaked to
  unauthorized or anonymous callers. Execution is authorized per-call either way.
- **Multi-principal coverage suite** (`tests/coverage.mjs`, 76 assertions) —
  drives a four-role fixture matrix (`fixtures.mjs`) against gated test tools to prove
  the planes conformance can't: tools/list visibility scoping (leakage), authz-deny, the
  full validation matrix (enum / numeric bounds / `format` / arrays / strings / no-coercion),
  transaction commit/rollback, idempotency (+ window expiry), rate-limit per-principal
  isolation, the approval queue + approve-executes-as-original-principal + reject +
  expired-never-executes + `mcp_approval_status` polling, token revoke (kill switch) +
  `allowed_tools` narrowing, abuse (auto-suspend / window-reset / unknown-tool), and
  **ledger tamper-evidence** (edits a canonical ledger field and asserts `verify_chain`
  detects it, then restores), plus the operator **web console** (authz-gating,
  access request→grant→mint→revoke, token IDOR guard, ledger JSON export). Assertions
  read real ledger / table / queue state — a broken plane fails them.
- **conformance.mjs** grew to 42 assertions — added the prompts surface (`prompts/list`,
  `prompts/get`, required-argument enforcement, unknown-prompt) and a malformed-input
  check.
- **Gated test tools** (`app/views/partials/mcp/tools/test_*`) + two principal-based
  policies + a host `test_note` table — registered only when `MCP_ENABLE_TEST_TOOLS` is
  set, never in production. Community-free.
- **CI** (`.github/workflows/mcp-ci.yml`) — static gates (engine-decoupling guard,
  tool linter, `pos-cli check`) on every PR + a live stage that reserves an ephemeral
  instance, deploys, and runs conformance + coverage + eval.
- **Security & architecture docs** (`modules/mcp/docs/`) — `security-model.md` (identity,
  transport, and the two-fold ledger-integrity model: append-only by construction +
  tamper-evident), `engine-commands-architecture.md`, and an exhaustive step-by-step
  request-flow walkthrough (`request-flow.md`).
- **Deterministic test fixtures** (`tests/seed/`) — migration-seeded fixed-id users,
  tokens, and access rows (gated by `MCP_SEED_TEST_FIXTURES`) so the conformance and
  coverage suites are repeatable across back-to-back runs instead of minting random state.

### Changed

- `conformance.mjs` resources test is now self-contained — it seeds and reads back its
  own markdown doc page (via the admin API) instead of assuming shipped content, and
  additionally asserts `resources/read` returns the markdown (guarding the html-leak
  fix). 35 → 36 assertions.
- `.platformos-check.yml` scoped to lint only pos-module-mcp's own sources; the module
  is now `pos-cli check`-clean.
- **Publish shape corrected** — the root `pos-module.json` now declares only the `user`
  dependency. The vendored `community` module and its dependencies belong to the test
  app, not to pos-module-mcp; publishing as-was would have pulled the whole test
  harness's dependency tree into consumers.
- **`app/` slimmed to the test surface** — removed the vendored user/admin module copies,
  community migrations, and unrelated assets/translations; `app/` now carries only the
  Layer-2 test tools, their queries, the `test_note` table, and the seed migration.

### Performance

- **Registry build cached** (`registry/load`) — the tool registry (manifest
  meta-validation + description lint) is deploy-invariant but was rebuilt on *every*
  `tools/list` and every `tools/call` (via `resolve_tool`). It is now wrapped in
  `{% cache %}` and shared across requests, auto-invalidated on deploy. The cache key
  folds in the `MCP_ENABLE_TEST_TOOLS` / `MCP_ENABLE_VULN_TOOLS` gate constants — a
  constant change is not a view change, so a static key would serve a stale registry.
- **Observability metrics via exact server-side counts** — the console metrics replaced
  an O(N) paged ledger scan (capped at 10k rows, ~10s at 10k) with a fixed set of
  `total_entries` filtered counts (one per outcome / decision / error-code / registered
  tool). Now all-time **exact**, uncapped, and flat (~O(1), index-backed) as the ledger
  grows; latency percentiles come from a bounded recent sample. Backed by new
  `ledger/count_all|count_by|count_by_int|recent_durations` queries, with the scan-vs-count
  decision measured by a perf harness (`tests/perf/ledger-metrics-bench.mjs`).
- **Per-request config memoization** — `commands/config` builds the effective config once
  and shares it across the function-tag subcontext via `context.exports` (a shared
  per-request namespace), instead of re-parsing the `MCP_CONFIG` constant on every command
  that reads it.

### Console

- **Left-sidebar navigation** replaces the top tab bar on the operator console — still
  URL-driven (`?tab=`), still JS-free; folds to a horizontal bar on narrow screens.
- **Gruvbox-dark TUI theme** across the operator console (`/mcp-admin`) and the token
  console (`/mcp-tools`): monospace, square corners, flat surfaces, visible box borders,
  a navy base with warm-indigo panels. Dark-only, with a local-first JetBrains Mono font
  stack (no external font fetch — a security console should not depend on one).
- **All presentation moved into stylesheet classes** — every inline `style=""` attribute
  removed from both pages (component classes + a small utility layer); conditional styling
  uses conditional classes.
- **Subtle CSS-only motion** — entrance fades, staggered card reveals, and gentle
  attention pulses (pending-approvals badge, chain-broken banner, freshly-minted token),
  all gated behind `prefers-reduced-motion: reduce`.
- **Token console restyle** — the three states (signed out / access-pending / token
  console) unified under a single HTML skeleton and stylesheet.

### Security

- **Authenticated pages are no longer cacheable (`Cache-Control: no-store`).** The token
  console renders a raw bearer token once (server-side one-shot via a session flash), but
  the browser's back-forward cache could restore the rendered page — token included — on
  Back → Forward, without re-hitting the server. Both `/mcp-tools` and the operator console
  `/mcp-admin` now send `no-store` (via `{% response_headers %}`), which makes them
  bfcache-ineligible: Back/Forward forces a fresh server round-trip, by which point the
  one-shot flash is already consumed. Also keeps secrets out of the disk cache.

### Testing

- **Test suites wrapped in [Vitest](https://vitest.dev)** — `conformance`, `coverage`,
  `eval`, and the static tool `lint-tools` are now `*.test.mjs` Vitest suites (named,
  isolated tests + per-check diffs + JUnit output for CI annotations) instead of hand-rolled
  pass/fail counters. Assertions and detection power are unchanged (the record-and-continue
  `ok()` maps to `expect.soft`). Because the live suites drive ONE instance and share mutable
  server state (ledger `seq`, rate/abuse windows, approval queue), the runner is pinned
  **strictly serial / single-instance** in `vitest.config.mjs` — relaxing that would let
  suites race. `npm test` runs them all.
- **Shared harness** (`tests/lib/harness.mjs`) — the MCP JSON-RPC client, config-constant
  setters, and browser-session helpers are now factory functions shared by the suites
  (no more copy-per-file). The static linter moved to `tests/lib/lint-tools.mjs`, which
  exports `lintAll()` and still runs as a dependency-free CLI (`node tests/lib/lint-tools.mjs
  [--strict] [--json]`). It now **skips the `vuln_*` negative-control fixtures by default**
  — those are deliberately-insecure tools for the runtime agentic-eval (gated by
  `MCP_ENABLE_VULN_TOOLS`), not authored tools the static gate should police; pass
  `--include-vuln` to analyze them anyway.
- **CI** now installs deps and runs `npx vitest run` for the live stage (JUnit annotations);
  the static stage runs the linter CLI (`--strict`) with no instance. Node bumped to 22 for
  Vitest 4.

## [0.1.0] - 2026-07-24

Initial pre-release of the governed Model Context Protocol engine — a standalone
platformOS module that turns an instance into an MCP server whose tool calls are
typed, identity-bound, authorized, reversible, and attested.

### Added

- **Engine (Layer 1)** — JSON-RPC 2.0 transport at `POST /mcp` (protocol
  `2025-06-18`): `initialize`, `ping`, `tools/list`, `tools/call`, `resources/*`,
  `prompts/*`, `logging/setLevel`, plus the built-in `mcp_approval_status` tool.
- **Governance planes** — bearer identity bound to a real pOS user; strict
  JSON-Schema validation (no coercion); named-policy authorization (fail-closed, no
  implicit allow); per-principal fixed-window rate limiting; transaction-wrapped
  execution with rollback; idempotency keys; human-in-the-loop approval; a
  hash-chained attestation ledger with `verify_chain`.
- **Tool authoring (Layer 2)** — registry + per-tool manifest/handler/policy/prompt
  partials; a `pos-cli generate` scaffolder with `read` / `create` / `command` modes
  (command mode inherits the app command's validations and side-effects).
- **Operator console** (`/mcp-admin`) — hash-chain status, metrics, pending
  approvals, MCP access management, registered-tool view, and the tool-surface eval.
- **Discovery & health** — `GET /mcp-health` readiness probe and
  `GET /.well-known/oauth-protected-resource` (RFC 9728).
- **Test harnesses** (`tests/`) — `conformance.mjs` (full pipeline over
  HTTP + ledger asserts), `eval.mjs` (tool-surface regression), `lint-tools.mjs`
  (static author-boundary security linter). All CI-gateable and non-destructive.
- **Config** — new `defaults.approval_max_pending_per_principal` (default `3`).

### Security

Hardening from the pre-release security review:

- **Approval queue-flood protection** — a duplicate pending request (same principal +
  identical argument hash) now returns the existing handle instead of stacking a new
  one, and each principal is capped at `approval_max_pending_per_principal` non-expired
  pending approvals. Excess is refused (`queue_full`); both cases are attested
  (`approval_duplicate` / `approval_throttled`) and counted as violations.
- **Operator queue drain** — `POST /mcp-admin/reject-principal` bulk-rejects every
  pending approval for one principal in a single action (bounded), complementing the
  inflow cap above.
- **Token kill-switch** — `POST /mcp-admin/token-revoke` lets an operator revoke any
  bearer token by id; the next request carrying it fails authentication. Idempotent;
  never exposes the token digest.
- **`logging/setLevel` validation** — the requested level is validated against the
  eight RFC 5424 levels; an unknown level is rejected with `-32602` instead of being
  silently accepted.
- **Layer-2 tool input hardening** — the demo event tools reject `javascript:` / `data:`
  link schemes via pattern and bound the event name to the underlying command's real
  limit (35), so the tool schema can no longer accept input the command rejects.

### Fixed

- **Resource read no longer leaks rendered HTML** — `resources/read` dropped its
  `page.html_content` fallback; a markdown resource with no source text now returns
  `-32002 Resource not found` instead of serving the page's rendered HTML mislabeled
  as `text/markdown`.

### Console

- **Tabbed operator console** — Overview · Approvals · Tokens & access · Ledger ·
  Tools & config, with no scroll-jump on switch and tab persistence across reloads.
- **Active-token table with an abuse watchlist** — per-principal violation counts and
  one-click revoke.
- **Ledger tooling** — security-lens quick filters, a filter form, throttle/dup
  metrics, a config viewer, and a paginated JSON export
  (`GET /mcp-admin/ledger-export.json`, honors active filters, capped with an explicit
  `capped` flag).

[Unreleased]: https://example.com/compare/v0.1.0...HEAD
[0.1.0]: https://example.com/releases/tag/v0.1.0
