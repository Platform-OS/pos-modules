# Security Model

**Scope.** The trust boundary of pos-module-mcp — how the module decides *who* is calling (identity), *whether* they may act (authorization), and how it produces a *tamper-evident record* of what happened (ledger). This document is the normative companion to the spec: it grounds each guarantee in the shipped engine (`modules/mcp/public/lib/commands/`) and states — honestly — where a guarantee ends.

- Per-command reference: [`engine-commands-architecture.md`](./engine-commands-architecture.md)
- End-to-end request lifecycle + all exit paths: [`request-flow.md`](./request-flow.md)
- Normative spec sections cited inline: [`pos-module-mcp-spec.md`](./pos-module-mcp-spec.md) §6 (ledger), §9 (identity), §12 (authorization/limits), §13 (transport/errors)

---

## 1. Threat model & trust boundary

An MCP server hands a language model a set of real, side-effecting tools. The adversary we defend against is **a capable-but-untrusted agent** (and a compromised or prompt-injected one) that will:

- send malformed, oversized, or hostile JSON-RPC;
- present missing / forged / stale / revoked credentials;
- try to act **above its principal's authority**, or **as another principal**;
- flood the endpoint or the human-approval queue;
- attempt to make the audit trail lie (skip, edit, reorder, or backdate entries).

The module's job is to make each of those either **impossible** or **detectable and attested**, and to do so **fail-closed** — no default-permit, default-accept, or default-serve path anywhere.

**What is inside the boundary:** the `/mcp` endpoint, identity resolution, schema validation, per-tool authorization, rate/abuse limits, the human-approval gate, transaction-wrapped execution, and the attestation ledger.

**What is *not* claimed** (honest boundaries, expanded in §6): the module does not defend against the **instance owner / direct database access** — an actor with the platform admin API or DB can alter any table. Against that actor the ledger provides **tamper-evidence** (detection), not prevention. It also cannot undo **external** side effects a tool caused (an email sent, a third-party charge) — only platformOS-transactional state rolls back.

---

## 2. Identity plane (spec §9; task-1.3)

> *Who is calling, and with what authority?* The core risk is the **confused deputy**: a standing credential that lets an agent act with more authority than the human behind it.

### 2.1 Token model

Identity is a **bearer token bound to a real platformOS user**. A user authenticates through the existing user/OAuth login and mints a token at `/mcp-tools`. The `mcp_token` row stores:

| property | meaning |
|---|---|
| `user_id` | the pOS user this bearer acts as — **the principal** |
| `token_digest` | `sha256(raw token)`, hex — the **raw token is shown once and never stored** |
| `label` | human/agent name shown in the ledger + operator UI |
| `status` | `active` \| `revoked` (the central kill switch) |
| `allowed_tools` | optional per-token narrowing — intersects the served set, **never widens** (§6.2) |
| `last_used_at` | best-effort recency stamp (throttled ≤1 write/min; not on the hot read path) |

Because only the **digest** is persisted, a database read cannot recover a usable credential. Revoking a token (`status → revoked`) takes effect on the **next** call — a central, immediate kill switch.

### 2.2 Resolution — fail-closed cascade (`identity/resolve_principal`)

Every `tools/call` resolves identity first. The cascade is fail-closed; each failure returns a distinct, stable machine `reason` (recorded, never sent verbatim on the wire):

1. no / malformed `Authorization: Bearer` → `401`, `missing_token` / `empty_token`, with `WWW-Authenticate`
2. digest not found → `401`, `unknown_token`
3. token `status != active` → `401`, `token_revoked`
4. token not bound to a user → `401`, `token_unbound`
5. success → `{ principal, agent, delegation_mode: 'direct', token_id }`

**Pre-auth failures are not ledgered.** A request with no accountable identity (bad/missing/revoked token) is written to the **platform log only**, never the hash-chained ledger — so anonymous probes cannot spam or grow the tamper-evident chain (a DoS / integrity-noise vector). Every gate *after* identity has an accountable principal and **does** attest.

### 2.3 Delegation — the authoritative subject

The contract carries a `delegation_mode`:

- **`direct`** (v1): the agent acts *as* the user; principal = agent-subject = that user.
- **`on_behalf_of`** (contract reserved): the authoritative subject for authorization is **`principal` (the human)**, never the agent (§9.4). A buyer's agent inherits the buyer's scope, never its own. This is enforced at the authorization step (§3), not merely labelled.

Keeping the agent/principal split in the contract from v1 means `on_behalf_of` can be added without changing callers.

### 2.4 OAuth resource-server posture (RFC 9728)

The module is an OAuth **protected resource**. On a `401` it emits `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource"`, and that well-known document (`views/pages/well-known-oauth-protected-resource.json.liquid`) advertises:

- `resource` — the per-instance resource identifier (`https://<host>/mcp`), so multi-tenant instances are distinguishable (§15);
- `resource_name`, `bearer_methods_supported: ["header"]`;
- `authorization_servers` — advertised **only** when an `MCP_OAUTH_ISSUER` is configured (the deferred external-AS/JWT strategy); absent by default.

v1 authenticates instance-issued tokens, so no JWT signing keys are required; the posture is forward-compatible with an external authorization server.

### 2.5 Least-leakage on denial (`identity/deny`)

Denials separate two strings: the **wire message** (generic, caller-safe — `"Authorization required"`, `"Invalid token"`, `"Forbidden"`) and the **ledger `reason`** (a precise, stable machine code). The wire never carries policy internals, token internals, or which specific check failed. `error` envelopes (§5) carry only caller-safe `message` + `data`.

**Identity invariants (verified by the conformance suite):** no anonymous execution · every call maps to a real user · no credential recoverable from storage · the agent is never authorized as itself in `on_behalf_of` · no token internals leak on denial.

---

## 3. Authorization plane (spec §12; task-1.6)

Between identity and action sits `authorize/evaluate` — the per-call, per-tool semantic control. The app declares a **named policy** per tool (`authorization_policy` in the manifest, resolved under `config.policy_prefix`, default `mcp/policies`). The policy receives `principal, agent, arguments, tool, delegation_mode` and returns a boolean or `{ allow, reason }`.

- **No implicit allow (§12.2):** a manifest with a blank/missing `authorization_policy` fails meta-validation and is **excluded from the registry** — there is no default-permit path.
- **Fail-closed:** a policy that does not affirmatively allow is a deny.
- **Module-owned, not domain-coupled:** the built-in policies read the module's own access model (`mcp_access`: role `admin`/`user`, status), *not* a business module's roles. `admin_only` checks MCP-operator status (`mcp_access` admin or the `MCP_ADMIN_USER_IDS` bootstrap); `members_can_write` / `public_read` require only an authenticated principal.

Every decision (`allow`/`deny`/`not_applicable`) and its `reason` are recorded on the ledger entry.

---

## 4. Ledger plane — tamper-evident attestation (spec §6; task-1.7)

> *A record of what actually happened that cannot be quietly rewritten.*

### 4.1 What is recorded, and when

`ledger/append` writes **one row per governed request outcome** — success **and** denial, validation failure, rate-limit, rollback, pending-approval. It runs on **every post-authentication termination**. Each row (table `mcp_ledger`) carries: `seq`, `occurred_at`, `method`, `tool_name`/`version`, `client_id`/`agent_id`/`principal_id`, `delegation_mode`, `input_sha256` + `input_bytes`, `authz_policy`/`decision`/`reason`, `execution_outcome`, `error_code`, `duration_ms`, `subject_type`/`subject_id`, `idempotency_key`, `request_id`, `audit_json`, and the chain fields `prev_entry_hash` + `entry_hash`.

### 4.2 Privacy posture — what is hashed vs. plaintext

- **Raw tool arguments are NEVER stored.** Only `input_sha256` (the hash of the canonical arguments) + `input_bytes`. So the ledger proves *which* arguments were used (anyone can recompute the hash from a candidate input) without retaining their content.
- **Everything else is plaintext** — tool name, principal, outcome, timings — so the ledger is *readable* by operators and auditors without a key.
- **`audit_json`** carries **only** the manifest-declared, non-sensitive `audit_fields`. A tool author opts specific fields in; nothing else from the arguments reaches the ledger. (The tool linter flags PII in `audit_fields`.)

**PII invariant:** no PII beyond declared `audit_fields`; arguments live only as a digest.

### 4.3 The hash chain

Each entry commits to all prior entries:

```
entry_hash = sha256( canonical(payload) || prev_entry_hash )
```

- **`ledger/canonical` is the single source of truth** for serialization: a fixed key order (strings then integers), every key always emitted (absent → `null`), and explicit per-type coercion so `"84"` and `84` serialize identically. Both `append` (hashing a fresh entry) and `verify_chain` (re-hashing a row read back from the DB as strings) call it, so the hash is reproducible across a DB round-trip. Without this shared serializer, reading the row back would produce false chain breaks.
- **`occurred_at` is stored as an ISO-8601 UTC string, not a datetime column** — on purpose: the datetime type reformats on read (`…:03Z` → `…:03.000Z`), which would break the chain; a string round-trips byte-exact and still sorts chronologically.
- The first entry links to 64 zeros (genesis).

### 4.4 Verification (`ledger/verify_chain`, `verify_chain_recent`)

`verify_chain` walks every entry in creation order (id ASC) and checks two invariants, returning the **first** break:

1. **linkage** — `entry.prev_entry_hash` equals the previous entry's `entry_hash`;
2. **integrity** — `sha256(canonical(payload) || prev_entry_hash) == entry_hash`.

Any edit, reorder, backdate, or fork breaks one of these; a tamper anywhere invalidates every later entry, so the earliest break is sufficient. `verify_chain_recent` is the bounded tail check (default 200) the operator console runs per load so dashboard cost doesn't grow with the ledger — same invariants, verifying from genesis if the window contains it, else anchoring on the oldest fetched row (a concurrency fork is always a recent append).

### 4.5 Immutability — the honest model

Immutability is enforced **two ways**, and it is important to be precise about each:

1. **Append-only by construction.** The module has **no code path that updates or deletes a ledger entry** — the `ledger/` GraphQL ops are create + reads only. (The single `record_update` in `ledger/` targets the separate `mcp_chain_lock` mutex row, never an entry.) Through the MCP surface and the app's own GraphQL, entries can only be appended. Combined with platformOS's default table posture, no *in-app* identity can mutate the ledger.

2. **Tamper-evidence for out-of-band changes.** An actor who **bypasses the app** — the platform admin API, a direct DB write, a backup edit — *can* physically alter a row. The hash chain exists precisely for this case: `verify_chain` **detects** it (the adversarial test edits a canonical field via the admin API and asserts the chain reports BROKEN, then restores the exact value and asserts it validates again). 

So the operative guarantee is: **append-only to every in-app identity, and tamper-evident against everyone else.** The ledger is *tamper-evident*, not *tamper-proof against the instance owner* — and that is the correct, honest claim for a single-instance audit log without external anchoring. (Anchoring the tip hash to an external notary would close that gap; it is out of scope for v1.)

### 4.6 Atomicity with mutations (§4.3, exercised in task-2)

For a **mutating** tool, `ledger/append` runs **inside the same `{% transaction %}`** as the handler and the idempotency record. On success all three commit together; on handler failure *or* a failed append, the whole transaction rolls back and a `rolled_back` outcome is attested **outside** the transaction. Consequences: an action can never commit without its attestation, an attestation can never exist without its action, and a rolled-back call leaves no partial state and no idempotency record (so a genuine retry re-executes).

### 4.7 Concurrency safety

Appends serialize on a singleton `mcp_chain_lock` row: inside the append transaction the writer `record_update`s the lock with a fresh unique token *before* reading the chain tail, which takes a Postgres row-write-lock held until commit — so two concurrent appends cannot both read the same tail and fork the chain. platformOS Liquid has no advisory lock / unique-index / CAS primitive; the mutex row is the available serialization mechanism. Verified fork-free under concurrent load.

**Ledger invariants:** every post-auth outcome attested · arguments hashed never stored · canonical hashing deterministic across DB round-trip · chain detects any edit/reorder/backdate/fork · append atomic with its mutation.

---

## 5. Transport plane (spec §13; task-1.2)

`rpc/dispatch` is the single entry behind `POST /mcp`. Before any routing it enforces the transport contract, fail-closed:

- **Size cap first:** a body over `max_input_bytes` (default 65536) → `413 / -32600 "Request too large"`, before parsing.
- **Envelope validation:** `jsonrpc` (if present) must be exactly `"2.0"`; a missing `method` is `-32600`. Unknown / unimplemented method → `-32601`. Notifications (`notifications/*`) → `202`, no body.
- **No lying surface:** a method the server does not implement returns `-32601`, never a partial/faked result.

**Error hygiene (`rpc/error`):** every error envelope is built in one place; messages are stable, caller-safe strings — never a stack trace, GraphQL text, or schema/policy internal. Machine-readable context (e.g. `validation_errors`) travels in `data`, also caller-safe.

**Documented platform caveat:** the JSON-RPC parse-error code `-32700` is unreachable — platformOS parses the request body into `context.params` *before* the page runs, so a malformed JSON body is rejected by the platform (HTTP 415) pre-dispatch. The achievable guarantee, asserted by the suite, is: malformed input is rejected with a 4xx, never accepted, never 5xx, never leaks internals.

### Error-code taxonomy

| code | HTTP | meaning |
|---|---|---|
| `-32600` | 400 / 413 | invalid request / oversized envelope |
| `-32601` | 400 | method not found |
| `-32602` | 400 / 409 | invalid params / unknown tool / arg-schema violation / idempotency-key reuse |
| `-32001` | 401 / 403 | authentication required / invalid token / forbidden / suspended |
| `-32002` | 429 | rate limit exceeded |
| `-32003` | 200\* | mutating handler rolled back (tool error; the *protocol* call still succeeded) |

\* A rolled-back mutation returns the handler's tool-error result (`isError:true`, HTTP 200); the JSON-RPC call itself succeeded.

---

## 6. Honest boundaries

What this security model deliberately does **not** claim:

- **The instance owner is trusted.** Anyone with the platform admin API or direct DB access can alter any table. Against that actor the ledger is **tamper-evident** (detected by `verify_chain`), not prevented. External anchoring of the tip hash would be required to defend the audit log against the instance owner; it is out of scope for v1.
- **External side effects are not transactional.** platformOS rolls back *its* state on failure; it cannot recall an email a tool already sent or a third-party charge it already made. Tool authors must design idempotent, retry-safe handlers for externally-visible effects.
- **`-32700` is unreachable** (see §5) — a platform pre-dispatch behavior, not an engine gap.
- **LLM tool-*selection* is not a module concern.** The module never calls an LLM (§2); tool-description quality is guarded statically (the description linter + the eval harness), but whether a model *chooses* the right tool is measured by the external eval runner, not enforced here.

---

## 7. Cross-reference index

| Plane | Commands | Spec | Tasks |
|---|---|---|---|
| Transport | `rpc/dispatch`, `rpc/error`/`success` | §13 | 1.2 |
| Identity | `identity/resolve_principal`, `identity/deny`, `tokens/mint`, well-known doc | §9, RFC 9728 | 1.3 |
| Authorization | `authorize/evaluate`, `access/*` | §12.2 | 1.6 |
| Availability | `limits/check`, `note_violation`, `enforce_abuse` | §12.4 | 1.6 |
| Ledger | `ledger/append`, `canonical`, `verify_chain`, `verify_chain_recent` | §6.1 | 1.7 |

All invariants above are exercised by `tests/conformance.test.mjs` (transport, identity, validation, execution, adversarial, ledger) and `tests/coverage.test.mjs` (authorization deny, commit/rollback, idempotency, approval, abuse, ledger tamper-evidence, web-console) — Vitest suites that gate CI.
