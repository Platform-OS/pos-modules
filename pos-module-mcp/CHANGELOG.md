# Changelog

All notable changes to **pos-module-mcp** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

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
