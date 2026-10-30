# Changelog

All notable changes to **pos-module-mcp** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **App fields on the OAuth approval page** (`oauth_consent_partial`,
  `oauth_approved_partial`; docs/oauth.md). An app can show checkbox fields on the
  approval page (for example "Which vaults may this app use?") and act on the ticked
  values after Approve. The hooks exchange data only: the engine renders and escapes the
  fields, passes the approved hook only the fields it showed (with `shown`), takes the
  person and the client from the session, and runs it only after Approve with a valid
  CSRF token. A hook that raises is logged and never blocks the sign-in.
- **MCP Apps declarations** (docs/mcp-apps.md). A manifest may declare
  `ui: { resource_uri, visibility }`; `tools/list` serves it as `_meta.ui { resourceUri,
  visibility }`, so hosts that support MCP Apps show the tool's card. An app-only tool
  (`visibility: ["app"]`) is listed in `tools/list` and answers `tools/call` (under its
  policy, scopes, rate limits and the ledger) only for a signed-in client that declared
  the `io.modelcontextprotocol/ui` extension with `text/html;profile=mcp-app`: per request
  for a modern client, and for an older one as recorded on its token at its last
  `initialize` (new `mcp_token.ui_apps`, `helpers/protocol/apps_client`). For any other
  client it is not listed and is an unknown tool. It is left out of
  `queries/registry/for_agent`, and `commands/execute/invoke` answers it as an unknown
  tool. Visibility is enforced by the host and is not a security boundary. A malformed `ui` (another key, a URI outside `ui://`, an empty or unknown
  visibility) excludes the tool. Provider `resources/read` content items keep their
  `_meta` when it is an object, so a card's `_meta.ui.csp` reaches the host. Tools without
  `ui` are served exactly as before.

### Changed

- **Discovery without a token is challenged too** (`oauth.challenge_initialize`, on by
  default). `tools/list`, `prompts/list`, `prompts/get`, `resources/list`,
  `resources/templates/list` and `resources/read` without a bearer now answer `401` with
  the `WWW-Authenticate` pointer, like `initialize` and `server/discover`, instead of an
  empty or anonymous list that a client reports as "no tools". `ping` and notifications
  stay open. With `challenge_initialize: false` discovery stays open as before.
- **`oauth.challenge_initialize` is on by default.** `initialize` and `server/discover`
  without a bearer now answer `401` with the `WWW-Authenticate` pointer to the OAuth
  metadata, so clients that start sign-in only on a 401 at connect time (Claude, Grok)
  sign in instead of connecting anonymously with no tools they can call. Clients that send
  a token are unaffected, and no tool ever ran without one. Set
  `MCP_CONFIG {"oauth":{"challenge_initialize":false}}` to keep the handshake open.

### Fixed

- **Clients that keep sending an older revision in `MCP-Protocol-Version` are served.**
  OpenAI's MCP client sends `2024-11-05` in the header after the `initialize` handshake
  agreed on `2025-06-18`, and every such request was refused with 400
  "Unsupported protocol version" before authentication, so ChatGPT signed in but found no
  tools. The header values in the new `compatible_protocol_versions` config key
  (`2025-11-25`, `2025-03-26`, `2024-11-05`) are now answered as `2025-06-18`. `initialize`
  still never selects them, and they are not listed as supported.
- **Refused requests leave a trace.** The `/mcp` page logs every answer of HTTP 400 or
  above as `mcp.request_refused`, and a `tools/list` with no tools as
  `mcp.empty_tools_list`, with a log-safe summary (`helpers/rpc/request_summary`: method,
  protocol versions, `Mcp-Method` / `Mcp-Name`, whether a bearer was sent, user agent and
  the JSON-RPC error; never the token or the arguments). A client that was refused before
  authentication used to leave nothing on the instance.
- **ChatGPT can sign in through a Client ID Metadata Document.** ChatGPT's document
  (`https://chatgpt.com/oauth/client.json`) prefers `private_key_jwt` in
  `token_endpoint_auth_method` but lists `none` in `token_endpoint_auth_methods_supported`,
  and authenticates as a public client when the server supports only `none`. The
  authorization endpoint read only the preferred method and refused it with "Only public
  clients … are supported". A document is now a public client when either field allows
  `none`; a document that does not allow `none` is still refused.

## [0.2.0] - 2026-10-23

Changes since 0.1.0. Entries marked **BREAKING** need action from apps upgrading from 0.1.0.

### Changed

- **BREAKING — accounts and access use the user module's RBAC.** The consoles resolve the
  signed-in user with `modules/user/helpers/current_profile` and gate pages with
  `can_do_or_unauthorized` (anonymous visitors are redirected to sign-in and returned).
  Access is two permissions — `mcp.tokens.manage` (`/mcp-tools`) and `mcp.admin`
  (`/mcp-admin`) — mapped to the roles `mcp_user` / `mcp_operator` in the app's
  `role_permissions` override; superadmins hold both. `admin_only` checks `mcp.admin` on
  the bearer principal via the new `modules/mcp/queries/principal/can`. The `mcp_access`
  table, the `MCP_ADMIN_USER_IDS` constant and the request-access flow
  (`POST /mcp-tools/request`) are removed; operators grant roles by email on the console.
  **Upgrading:** define the two roles in your permissions override, then grant
  `mcp_user` / `mcp_operator` to existing members (or rely on superadmin for operators).
- **BREAKING — a token works only while its user holds MCP access.** Every `/mcp` call
  re-checks `oauth.required_permission` (`mcp.tokens.manage`) and answers `401`
  (`permission_revoked`) without it; refresh answers `invalid_grant`. A role removed by
  any path (profile edit, another admin tool, user deletion) stops manual and OAuth
  tokens at once.
- **BREAKING — HTTP status and codes on `/mcp`.** Method-level JSON-RPC errors answer
  HTTP 200 so 2025-06-18 clients read the typed error instead of failing on the
  transport. Only `401` (authentication), `403` `insufficient_scope` (step-up), malformed
  requests (400 / 413) and the 2026-07-28 transport errors keep a non-200 status.
  - Rate limit: `-32004` (was `-32002`, which MCP defines as "resource not found"),
    with a `Retry-After` header and `error.data.retryAfter`.
  - Invalid arguments: a tool execution error (`result.isError: true`, the errors in
    the text and, for a tool without `output_schema`, in
    `structuredContent.validation_errors`) instead of `-32602` (MCP 2025-11-25, SEP-1303),
    so the model can correct its call.
  - Unknown tool, forbidden, access suspended, idempotency-key reuse (was 409), unknown
    method, unknown prompt and bad logging level: HTTP 200.
- **BREAKING — the `mcp_` prefix is reserved.** An app tool named `mcp_*`, or a manifest
  naming an `mcp_*` policy other than the built-in `mcp_authenticated`, is excluded at
  load; app policy files named `mcp_*` are never loaded. The tool linter reports both as
  errors.
- **BREAKING — unsupported `format` values are rejected.** An input-schema `format`
  other than `uuid`, `email`, `date` or `date-time` makes the manifest invalid (it was
  silently not enforced); the linter rule `format-unsupported` is now an error.
- **BREAKING — engine partials moved.** Apps calling any of these as
  `modules/mcp/commands/…` must update the path:
  - to `modules/mcp/helpers/…` (side-effect free): `config`,
    `rpc/{error,success,invalid_arguments_result}`, `identity/deny`, `execute/result_of`,
    `ledger/canonical`, `protocol/*`, `tasks/present`, `validate/json_schema`,
    `registry/{manifest_schema,validate_schema_node,lint_description}`,
    `resources/clean_entries` and
    `oauth/{append_params,error,parse_url,pkce_verify,random_secret,normalize_scope,public_https_url,redirect_uri_valid,redirect_uri_allowed}`;
  - to `modules/mcp/queries/…` (read-only): `registry/{build,build_prompts,load,resolve_tool}`,
    `ledger/{verify_chain,verify_chain_recent}`, `idempotency/lookup`,
    `identity/token_still_authorized`, `resources/provider` and `observability/metrics`.
- **Commands that write follow Build/Check/Execute.** `access/set_role`, `tokens/mint`,
  `oauth/register`, `oauth/revoke`, `oauth/issue_code`, `oauth/issue_tokens`,
  `approval/create`, `approval/claim`, `idempotency/store`, `limits/check` and
  `limits/note_violation` keep their path and return contract. Incomplete input now fails
  closed (`allowed: false`, `claimed: false`, no row written); `tokens/mint` with a blank
  `user_id` returns `{ error: 'invalid', errors }` instead of minting an unbound token.
  `ledger/append` stays single-step on purpose: attestation is never refused.
- **Dependencies are `core` and `user`.** `core` (^2.1.9) is now declared; the test app's
  `community` / `components` are dev dependencies only and are no longer pulled into
  consumers.
- **App-side MCP files live in `app/lib/mcp/`** (was `app/views/partials/mcp/`). Logical
  paths (`mcp/registry`, `mcp/tools/<name>/call`, `mcp/policies/<name>`, …) are
  unchanged, so existing apps keep working; the `tool` generator now writes to
  `app/lib/mcp/tools/`.
- **Docs are no longer shipped with the module.** They moved from `modules/mcp/docs/` to
  the repository's `docs/`.
- **Approved actions re-check the requesting token.** `mcp_pending_approval` stores the
  requester's `token_id`; on approval the token must still be active, allow the tool and,
  for a mutating tool, carry `mcp:write`, and the user must still hold MCP access. An
  OAuth grant must also still be renewable and bound to this server. Otherwise the
  approval fails with "Requester's access was revoked." Approvals queued before this
  change have no `token_id`; for them only the user's permission is re-checked.
- **Ledger rows record their hash format.** New `mcp_ledger.canonical_version` (1),
  included in the hashed payload; `ledger/canonical` picks the field list by version, so
  a later format change never breaks verification of older rows. Existing rows are
  verified as version 0.
- **Token labels name one agent.** `tokens/mint` refuses a label the person already uses
  on an active manual token (ignoring case; revoked and OAuth tokens do not count) with
  `{ error: "label_taken" }`, shown on `/mcp-tools`; a blank label gets a generated one
  (`mcp-client-` + 6 characters) instead of the shared `mcp-client`.
- **Fallback connection instructions** (used when the app has no instructions partial)
  are short and factual: no "call tools/list", no claim that descriptions are
  authoritative, no threat. They state that refused calls in a short time suspend the
  token, and mention documentation resources only when they are exposed.
- **Consoles.** `/mcp-admin` has left-sidebar navigation (still URL-driven and JS-free).
  Both consoles use a dark monospace theme with a local font stack, no inline styles, and
  CSS-only motion that respects `prefers-reduced-motion`. `/mcp-tools` says "access token"
  and "AI app that supports MCP" instead of "bearer token" and "MCP client", names the
  field "Name", and links back to the site.
- **Performance.** The tool registry is cached across requests and invalidated on deploy
  (the key includes the test-tool gate constants). Console metrics use exact server-side
  counts instead of a capped ledger scan. The effective config is built once per request.

### Added

- **Built-in OAuth 2.1 authorization server.** MCP clients connect without a hand-minted
  token: RFC 9728 / RFC 8414 metadata, `/oauth/authorize` with sign-in and consent,
  `/oauth/token` (authorization code + PKCE `S256`, rotating refresh tokens with reuse
  detection), Client ID Metadata Documents, Dynamic Client Registration and
  `/oauth/revoke`. Tokens are opaque, bound to the user, client, resource (`/mcp`) and a
  scope (`mcp:read`, `mcp:write` for mutating tools); a missing scope answers `403`
  `insufficient_scope`. `/oauth/token` requires `redirect_uri` when it was sent to
  `/oauth/authorize` (OAuth 2.1 §4.1.3). The opt-in `oauth.challenge_initialize` asks
  for sign-in on `initialize` and `server/discover`. See `docs/oauth.md`.
- **MCP `2026-07-28` support, negotiated per request.** A request is modern when
  `params._meta["io.modelcontextprotocol/protocolVersion"]` names it; everything else,
  and every `initialize` handshake, stays on `2025-06-18` unchanged.
  - The `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name` headers must match the body
    (400, `-32020`; Base64-sentinel values are decoded first); an unsupported revision
    answers 400 `-32022` with `data.supported` and `data.requested`.
  - New `server/discover` (supported revisions, capabilities, instructions, server
    identity, cache hint). Every result carries `resultType`.
  - List results and `resources/read` carry `ttlMs` / `cacheScope` (`public` /
    `private`).
  - Methods the revision does not define (`ping`, `logging/setLevel`, unknown methods)
    answer 404 `-32601`; a missing resource answers `-32602`.
  - `initialize` advertises `_meta.supportedProtocolVersions`; `/mcp-health` lists
    `protocols_supported`.
- **Tasks extension (`io.modelcontextprotocol/tasks`).** For a modern client that
  declares the extension, an approval-gated `tools/call` answers with a `CreateTaskResult`
  (`resultType: "task"`). `tasks/get` returns `working`, then `completed` with the tool
  result, `failed` with the error the inline call would have returned (an expired
  approval is `-32005`), or `cancelled`. `tasks/cancel` withdraws a pending approval;
  `tasks/update` only acknowledges input responses, so an agent can never approve its
  own action. Tasks are self-scoped: an unknown or foreign task is `-32602`. A client
  that did not declare the extension gets 400 `-32021` and keeps using
  `mcp_approval_status`. New `mcp_pending_approval` columns `result_json` and
  `error_json`, and config `defaults.task_poll_interval_ms` (30000).
- **In-process tool call for code inside the app.** `modules/mcp/commands/execute/invoke`
  runs one tool call for a principal and agent the app already holds (for example an
  in-app assistant acting for a person) through the same steps as `tools/call` after
  authentication: tool resolution with `allowed_tools`, strict argument validation, the
  policy, the handler (mutating tools in a transaction with their ledger entry) and the
  ledger. It skips HTTP concerns (token, OAuth scope, rate limit, abuse counter,
  idempotency, Tasks); a `requires_approval` tool is refused. The answer is `{ result }`
  or `{ error: { code, message } }`, plus `outcome` and `request_id`.
  `modules/mcp/queries/registry/for_agent` lists the tools such an agent may use, in the
  `tools/list` shape.
- **Resources from the app, per caller.** A resource provider partial
  (`resources_partial`, default `mcp/resources`) answers `list`, `templates` and `read`
  for an authenticated caller and receives `principal` and `agent`. Its entries are added
  to `resources/list` (with its own `nextCursor` paging) and `resources/templates/list`;
  only the keys MCP defines are passed on, and the `mcp+page:` scheme is reserved. A
  provider read goes through the same controls as a tool call: auto-suspend, rate limit,
  the `mcp:read` scope and a ledger entry (URI hashed). A resource the caller may not
  read is "Resource not found", the same as a missing one. Anonymous callers and apps
  without the partial see only the markdown pages, as before.
- **Prompts know the caller.** The prompts partial and each prompt template receive
  `principal` and `agent` (nil without a bearer), and the template also receives
  `prompt`, the entry the partial returned, with any extra keys it set. An app can offer
  different prompts to different people, and one template can serve many prompts. A
  prompt the partial does not offer to this caller is unknown to `prompts/get`.
- **Tool `title`, `annotations` and `outputSchema` in `tools/list`.** A manifest may
  declare `title`, `annotations` (the four MCP behaviour hints, each boolean; anything
  else makes the manifest invalid) and `output_schema`, which is checked in output mode
  (object root, `"null"` allowed in type lists, depth limit
  `defaults.max_output_schema_depth`, default 8).
- **`agent.token_id` for tool handlers**, next to `id`, `client_id` and `allowed_tools`,
  so handlers can tell two tokens of one person apart. Approved actions also get the
  requesting agent's `client_id` and `token_id` (new `mcp_pending_approval` columns
  `requested_by_client_id` / `requested_by_token_id`).
- **`format: "date"`** in `input_schema`: `YYYY-MM-DD` that is a real calendar day
  (`2026-02-31` is rejected).
- **Principal-scoped tool discovery.** Config `tools_list_scope`: `open` (default) keeps
  public discovery; `principal` lists only the tools the caller's policy admits.
- **The tool-poisoning lint covers all model-read text**: every `description` and
  `title` in `input_schema` / `output_schema` and the tool `title` (non-fatal; listed in
  manifest warnings and the registry's `_lint`). The operator eval adds
  `surface/instructions_no_poison` and `surface/prompt_no_poison`.

### Removed

- Config keys that did nothing or misled: `endpoint_path` (the endpoint is always
  `/mcp`), `oauth.issuer` / `MCP_OAUTH_ISSUER` (while the constant is still set the
  built-in authorization server stays off and `mcp.config_retired_issuer` is logged),
  `oauth.audience` / `MCP_OAUTH_AUDIENCE`, `ledger.retention_days` and
  `defaults.timeout_ms`. The manifest `timeout_ms` field is accepted but reserved;
  handlers run without a time limit.

### Fixed

- **Ledger hash-chain fork under concurrency.** Two near-simultaneous appends could link
  to the same `prev_entry_hash`, forking the chain. `ledger/append` now serializes on a
  row lock of the new singleton `mcp_chain_lock` table; verified fork-free under 80
  concurrent appends.
- **Text with HTML entities no longer breaks tool calls or changes on the way.** Tool
  arguments containing `&quot;` failed with HTTP 500, and `&amp;` / `&lt;` reached the
  handler decoded. The same affected stored approval arguments, idempotent replays, the
  OAuth `state`, client metadata documents, `MCP_CONFIG` and console eval results. All
  now parse with `raw_text: true`.
- **An invalid bearer is answered with 401 on every method**, including `tools/list`,
  `prompts/list`, `resources/*` and `initialize`, with
  `WWW-Authenticate: … error="invalid_token"` (RFC 6750). Before, a revoked token saw an
  empty tool list instead of being asked to sign in again. Requests without a bearer stay
  open.
- **`GET` / `DELETE /mcp` answer 405 with `Allow: POST`** instead of 404, as the
  2025-06-18 transport requires.
- **Absolute URLs honour the real origin** (new `modules/mcp/queries/origin`): the RFC
  9728 resource identifier, the `resource_metadata` link, resource `public_url`s and the
  `/mcp-tools` connect command were wrong on plain http or a non-default port.
- **Console "Remove access" confirmation** said the member's tokens stay active; removal
  revokes them all.

### Security

- **Console forms check the form token.** The POST pages of `/mcp-tools` and
  `/mcp-admin` refuse a request without a valid `authenticity_token` with `403` and change
  nothing; the OAuth consent decision answers `400` and never redirects.
- **Authenticated pages send `Cache-Control: no-store`**, so the back-forward cache can
  no longer restore `/mcp-tools` with a freshly minted token on it.

### Development

Not shipped with the module.

- Tests are Vitest suites (`npm test`, strictly serial against one instance):
  `conformance`, `coverage` (multi-principal matrix), `eval`, `invoke`, `oauth`,
  `lint-tools`, and `portable`, a conformance suite that runs on any instance with the
  module and cleans up after itself. Shared harness in `tests/lib/`.
- Gated fixtures for the suites, never served in production: test tools
  (`MCP_ENABLE_TEST_TOOLS`), deliberately vulnerable tools (`MCP_ENABLE_VULN_TOOLS`) and
  migration-seeded users and tokens (`MCP_SEED_TEST_FIXTURES`), in `app/lib/mcp/tests/`.
- `agentic-eval/` drives a real LLM agent against the endpoint and grades it from the
  ledger and active probes, including a negative-control mode and a stored prompt
  injection scenario.
- CI runs the static checks (engine-decoupling guard, tool linter, `pos-cli check`) and
  the live suites on an ephemeral instance.

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

[Unreleased]: https://example.com/compare/v0.2.0...HEAD
[0.2.0]: https://example.com/compare/v0.1.0...v0.2.0
[0.1.0]: https://example.com/releases/tag/v0.1.0
