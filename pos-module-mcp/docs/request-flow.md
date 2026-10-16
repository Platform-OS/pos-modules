# Request Flow — from an agent's call to the response

**Scope:** the complete lifecycle of a single request against the governed MCP endpoint, traced against the real code in `modules/mcp/public/`. Every stage, every branch, every exit path, and what gets written to the ledger at each one.

**Entry point:** `POST /mcp` → `views/pages/mcp.json.liquid` → `commands/rpc/dispatch` → (for tool calls) `commands/rpc/tools_call`.

Read this top-to-bottom: first the 30-second map, then the two flow diagrams, then the step-by-step narration where each exit is spelled out.

---

## 0. The 30-second map

```
Agent  ──HTTP POST /mcp (JSON-RPC 2.0, Bearer token)──►  mcp.json.liquid  (marshals HTTP)
                                                              │
                                                        rpc/dispatch      (envelope + routing)
                                                        ┌─────┴─────────────────────┐
                                          OPEN methods  │                           │  tools/call
                             (initialize, ping,         │                           │  (the governed path)
                              tools/list, resources/*,  │                           ▼
                              prompts/*, logging)       │                    rpc/tools_call
                                                        ▼                    ┌──────────────┐
                                              handled inline,                │  8 gates,    │
                                              result or error,               │  fail-closed │
                                              mostly no ledger               └──────┬───────┘
                                                                                    ▼
                                                                            JSON-RPC response
                                                                        (+ a ledger entry, always)
```

Two families of methods leave `dispatch`:

- **Open methods** — discovery and plumbing (`initialize`, `server/discover`, `ping`, `tools/list`, `resources/list`, `resources/read`, `resources/templates/list`, `prompts/list`, `prompts/get`, `logging/setLevel`). No Bearer token required; **listing is not executing.** These do *not* write to the hash-chained ledger (they take no action). `tools/list` can optionally resolve identity to *filter* what it advertises, but never blocks. One exception: a `resources/read` of a resource served by the **app's resource provider** returns app data, so it needs a signed-in caller and runs suspension, rate-limit and scope checks and writes a ledger entry (section 3b).
- **`tools/call`** — the one path that can cause a side effect, and therefore the one path that runs every governance gate and writes a ledger entry for **every** authenticated outcome.

Everywhere below, one rule holds: **fail-closed.** Any check that cannot conclusively say "allow" ends the request as deny / invalid / error — never as an accidental allow.

---

## 1. Before the request: how the agent got a token

The agent is not anonymous. A human first signs in to the instance (existing user/OAuth login), opens `/mcp-tools`, and mints a Bearer via `commands/tokens/mint` (build → check → execute). That command:

- generates a random raw token,
- stores **only its `sha256` digest**, bound to the human's `user_id` (+ an optional `label` and `allowed_tools` scope),
- returns the raw token **once**.

So by the time a request arrives, the token on the wire maps to a **real platformOS user**, and the stored side of that mapping is a digest that cannot be reversed into a working credential. This is the root of the identity plane — everything downstream reasons about *that user* (the "principal"), not about the agent's own say-so.

---

## 2. HTTP entry — `views/pages/mcp.json.liquid`

A `method: post, format: json` page. It does no logic; it is the HTTP marshaller:

1. Calls `rpc/dispatch` with `context.params` (parsed JSON body merged with query) and `context.headers`.
2. Sets the HTTP status from `out.http_status` (default 200).
3. Sets any response headers from `out.headers` (e.g. `WWW-Authenticate`, `Retry-After`).
4. `echo`es `out.body` — the JSON-RPC envelope — unescaped. For a `202` notification there is no body.

Everything of substance happens in `dispatch` and below.

---

## 3. Dispatch — `commands/rpc/dispatch`

Pure orchestration: validate the envelope, enforce the transport size cap, route the method. Here is every branch, in order.

```mermaid
flowchart TD
  A[POST /mcp body+headers] --> B{size > max_input_bytes?}
  B -- yes --> B1[413 · -32600 Request too large]
  B -- no --> C{jsonrpc present and != 2.0?}
  C -- yes --> C1[400 · -32600 Invalid Request]
  C -- no --> D{method blank?}
  D -- yes --> D1[400 · -32600 Invalid Request]
  D -- no --> E{method startswith notifications/ ?}
  E -- yes --> E1[202 · no body]
  E -- no --> F{method == tools/call?}
  F -- yes --> G[[rpc/tools_call — the governed pipeline]]
  F -- no --> H{which open method?}
  H -- initialize --> H1[rpc/initialize → 200 success]
  H -- ping --> H2[rpc/ping → 200 success]
  H -- tools/list --> H3{tools_list_scope}
  H3 -- open --> H3a[list every tool → 200]
  H3 -- principal --> H3b[resolve identity fail-soft; filter list → 200]
  H -- resources/list --> H4[rpc/resources_list → 200]
  H -- resources/templates/list --> H5[rpc/resources_templates_list → 200]
  H -- prompts/list --> H6[rpc/prompts_list → 200]
  H -- logging/setLevel --> H7{valid RFC-5424 level?}
  H7 -- yes --> H7a[200 · empty result no-op]
  H7 -- no --> H7b[200 · -32602 unknown level]
  H -- resources/read --> H8{provider URI?}
  H8 -- no: mcp+page or bare slug --> H8m{_error?}
  H8m -- yes --> H8a[200 · error body]
  H8m -- no --> H8b[200 · success contents]
  H8 -- yes --> H8p[[resources/read_provided — governed read, ledgered]]
  H -- prompts/get --> H9{_error?}
  H9 -- yes --> H9a[200 · error body]
  H9 -- no --> H9b[200 · success messages]
  H -- unknown --> H10[200 legacy / 404 modern · -32601 Method not found]
```

Notes on the dispatch branches:

- **Size cap first.** `input_bytes = params | json | size` is checked against `cfg.defaults.max_input_bytes` *before any other work*, so an oversized body is cheap to reject (`413`, `-32600`).
- **Envelope validation.** `jsonrpc`, if present, must be exactly `"2.0"`; a missing `method` is `Invalid Request`. Both are `400 / -32600`.
- **Notifications** (`notifications/*`) are acknowledged with `202` and **no body** — JSON-RPC notifications expect no response.
- **`tools/call`** hands off the whole outcome (status/headers/body) to `rpc/tools_call` (section 4).
- **Open methods** are wrapped in a success envelope and returned `200`. Two of them can carry a structured `_error` (unknown resource / unknown prompt): both return the error at `200` (a method-level error is not a transport failure). A `resources/read` refusal that carries its own status (rate limit, scope, suspension) keeps it.
- **`tools/list` scoping.** With `tools_list_scope: 'open'` (default) it lists everything. With `'principal'` an authenticated caller sees only the tools they may call; a caller without a bearer is the `anonymous` scope and is advertised nothing.
- **Presented credentials are checked on every method.** `rpc/dispatch` resolves a bearer whenever the request carries one (except `tools/call` and `tasks/*`, which authenticate themselves) and passes the identity to the router. A bearer that does not resolve — unknown, revoked, expired, wrong audience — answers `401` with `WWW-Authenticate: … error="invalid_token"` on discovery too, as the MCP authorization spec and RFC 6750 require. A request without a bearer stays open (unless `oauth.challenge_initialize` is on for `initialize` / `server/discover`).
- **Resources from the app.** For a signed-in caller, `resources/list` and `resources/templates/list` add what the app's resource provider (`resources_partial`, default `mcp/resources`) offers *this* caller — it receives `principal` and `agent` — and are cached `private`. Entries are checked first: no address or name, or the reserved `mcp+page:` scheme, and the entry is dropped. A `resources/read` of a URI with any other scheme than `mcp+page:` goes to `resources/read_provided` (below); a caller without a bearer gets "Resource not found".
- **`logging/setLevel`** is a deliberate open no-op — but it still validates `level` against the RFC-5424 set; garbage input is `200 / -32602`, never a silent `{}`.
- **Unknown / not-yet-implemented method** → `-32601 "Method not found"`, HTTP `200` for legacy requests and `404` for modern (`2026-07-28`) ones. The surface never lies about what it implements.

None of the open-method branches write to the hash-chained ledger — they take no governed action — except a read from the app's resource provider (3b).

### 3b. A provider resource read — `commands/resources/read_provided`

A `resources/read` of an app resource returns app data, so it runs a short version of the `tools/call` gates for the signed-in caller (`rpc/dispatch` already resolved the bearer):

1. **Auto-suspend** — `limits/enforce_abuse`; a suspended token gets `403 / -32001 "Access suspended"`.
2. **Rate limit** — the same per-principal window as `tools/call`; over it → `429 / -32002` with `Retry-After`, ledgered, counted as a violation.
3. **Scope** — the token needs `mcp:read`; otherwise `403 / -32001 "Insufficient scope"` with an `insufficient_scope` challenge, ledgered.
4. **Provider read** — `resources/provider` with `operation: read`, `principal` and `agent`. The provider applies the app's access rules and returns nil for anything the caller may not read, so a forbidden resource and a missing one both answer `-32002 "Resource not found"` (`-32602` for a modern request), ledgered as `invalid`. A provider that raises, or whose contents are not `[{ uri, text | blob, mimeType? }]`, is logged and answered `-32603 "Internal error"`, ledgered as `error`. Success is ledgered as `success`.

Ledger entries use `method: resources/read`; the URI is stored only as `input_sha256`.

---

## 4. The governed pipeline — `commands/rpc/tools_call`

This is the spine. It runs eight gates in a fixed order; **any gate can end the request**, and every authenticated ending writes exactly one ledger entry (the rate-limit and abuse paths are the only ones with an extra note). The order is not negotiable — nothing reaches execution having skipped a gate.

```mermaid
flowchart TD
  S([start: stamp latency clock]) --> AU[Gate 1 · identity/resolve_principal]

  AU -->|not authenticated| AUx[platform LOG only · 401 + WWW-Authenticate\nNO ledger entry — no accountable identity]
  AU -->|authenticated| AB[Gate 1b · limits/enforce_abuse]

  AB -->|already suspended| ABx[200 · -32001 Access suspended]
  AB -->|ok| RL[Gate 2 · limits/check per-principal rate]

  RL -->|over limit| RLx[LEDGER: error/-32004 + note_violation\nRetry-After · 200 -32004]
  RL -->|ok| H[hash args → input_sha256; build base ledger entry]

  H --> RT[Gate 3 · registry/resolve_tool + allowed_tools]
  RT -->|unknown/excluded/not-allowed| RTx[LEDGER: invalid/-32602 + note_violation\n200 -32602 Unknown tool]
  RT -->|found| SC[Gate 3b · OAuth scope: mcp:write for mutating]
  SC -->|missing| SCx[LEDGER: deny/-32001\n403 insufficient_scope + WWW-Authenticate]
  SC -->|ok| VA[Gate 4 · validate/json_schema STRICT]

  VA -->|invalid args| VAx[LEDGER: invalid/-32602 + note_violation\n200 isError:true + validation_errors]
  VA -->|valid| AZ[Gate 5 · authorize/evaluate named policy]

  AZ -->|deny / no implicit allow| AZx[LEDGER: deny+denied/-32001 + note_violation\n200 -32001 Forbidden]
  AZ -->|allow| AP{tool.requires_approval?}

  AP -->|yes| APG{flood/dup check}
  APG -->|duplicate| APd[LEDGER: approval_duplicate + note_violation\n200 isError:true status=duplicate]
  APG -->|over cap| APc[LEDGER: approval_throttled + note_violation\n200 isError:true status=queue_full]
  APG -->|ok| APok[approval/create → handle\nLEDGER: pending_approval\n200 isError:false handle+expires_at]

  AP -->|no| ID{tool.idempotent & key present?}
  ID -->|key hit, args differ| IDx[LEDGER: invalid/-32602\n200 -32602 key reused w/ diff args]
  ID -->|key hit, args match| IDr[LEDGER: replayed\n200 cached response — no re-exec]
  ID -->|miss or n/a| EX{tool.mutating?}

  EX -->|yes| TX[[transaction: execute/run]]
  TX -->|success + ledger append ok| TXc[commit: LEDGER success +subject\n idempotency stored INSIDE txn]
  TX -->|handler fail OR append fail| TXr[ROLLBACK all\nLEDGER rolled_back/-32003 OUTSIDE txn]
  EX -->|no| RD[execute/run · no txn\nLEDGER exec.outcome +subject\n store idempotency if success]

  TXc --> RESP[Step 10 · execute/result_of → 200 success]
  TXr --> RESP
  RD --> RESP
  IDr --> DONE([response])
  RESP --> DONE
```

### Gate-by-gate

**Clock.** First line stamps a unix-ms `start_ms` onto the ledger entry as `_start_ms`; `ledger/append` derives `duration_ms` from it. Latency is measured across the whole pipeline.

**Gate 1 — Identity (`identity/resolve_principal`).** Verifies the Bearer token and maps it to `{ principal, agent, delegation_mode:'direct', token_id }`. Fail-closed cascade, each returning a distinct stable `reason`:
- no/malformed `Authorization: Bearer` → `401`, `reason: missing_token` / `empty_token`, `WWW-Authenticate: …`
- digest not found → `401`, `unknown_token`
- token `status != active` (revoked/suspended) → `401`, `token_revoked`
- token not bound to a user → `401`, `token_unbound`
- OAuth token expired → `401`, `token_expired`; bound to another resource → `401`, `wrong_audience`
- the user no longer holds `mcp.tokens.manage` → `401`, `permission_revoked`

**Key policy — pre-auth failures are NOT ledgered.** On any of the above, `tools_call` writes to the **platform log only** (`log auth.reason, type:'mcp.auth_denied'`) and returns the `401`. There is no accountable identity, so anonymous probes can't spam or grow the tamper-evident chain (that would be a DoS / integrity-noise vector). Every gate *after* this point has an authenticated identity and *does* ledger. On success, the token's `last_used_at` is best-effort stamped (throttled to ≤1 write/min/token).

**Gate 1b — Abuse auto-suspend (`limits/enforce_abuse`).** Reads the principal's O(1) windowed violation counter. If it has crossed the threshold, the command **revokes the token** (status → suspended) and writes a `security/suspend` ledger entry, and this call returns `-32001 "Access suspended"` (HTTP 200). Every subsequent call then fails Gate 1 as `token_revoked`. This is a real containment control, not a warning — and it never scans the ledger on the hot path (an earlier version did and blew the per-request budget).

**Gate 2 — Rate limit (`limits/check`, scope `principal:<id>`).** Fixed per-minute window against `cfg.defaults.rate_limit_per_min`. Over the limit: **write a ledger entry** (`execution_outcome: error`, `error_code: -32004`), call `note_violation` (feeding Gate 1b), and return `-32004 "Rate limit exceeded"` with HTTP 200, the `Retry-After` header and `error.data.retryAfter` (seconds). `-32004` is implementation-defined; `-32002` means "resource not found" in MCP. This is the first *authenticated* exit, so it *is* ledgered.

**Argument hashing.** Past the limits, the arguments are serialized and `input_sha256 = sha256(args_json)` is computed. **Raw arguments are never stored** — only the digest + byte count go into the ledger (plus any handler-declared `audit_json`). A `request_id` (uuid) and the base ledger entry `le` are assembled here and filled in per outcome.

**Gate 3 — Registry resolve (`registry/resolve_tool`).** Looks the tool name up in the built registry, applying the token's `allowed_tools` narrowing (intersect only). A name that is unregistered, excluded (its manifest failed meta-validation at build), or outside this token's `allowed_tools` → **not found** → ledger (`invalid`, `-32602`) + `note_violation` + `-32602 "Unknown tool"` (HTTP 200). The surface can never execute an unvalidated action.

**Gate 3b — OAuth scope.** A mutating tool needs `mcp:write`, anything else `mcp:read` (manual tokens carry both). Missing → ledger (`deny`, `insufficient_scope`, `-32001`) and `403` with `WWW-Authenticate: … error="insufficient_scope"` so the client can ask the user for the wider scope. Scope only narrows; Gate 5 still runs.

**Gate 4 — Argument validation (`validate/json_schema`, STRICT).** Validates the arguments against the tool's `input_schema`: no type coercion (`"42"` ≠ integer `42`), unknown keys rejected, `additionalProperties` forced false, depth capped at `max_schema_depth`. Invalid → ledger (`invalid`, `-32602`) + `note_violation` + a **tool execution error**, not a protocol error (MCP 2025-11-25, SEP-1303): HTTP 200, `result.isError: true`, the errors in the text content and — when the tool declares no `output_schema`, which an error object would not match — in `structuredContent.validation_errors` (which key / which constraint — safe for the agent to self-correct, no server internals).

**Gate 5 — Authorization (`authorize/evaluate`).** Evaluates the tool's named policy for the resolved principal (in `on_behalf_of` mode the authoritative subject is the human, never the agent). Returns boolean or `{allow, reason}`; the `reason` is recorded to the ledger regardless. **No implicit allow** — a policy that doesn't say yes is a no. Deny → ledger (`authz_decision: deny`, `execution_outcome: denied`, `-32001`) + `note_violation` + `-32001 "Forbidden"`, HTTP 200 (generic wire message; the specific reason stays in the ledger). Allow → `authz_decision: allow`, continue.

**Gate 6 — Approval gate (only if `tool.requires_approval`).** A tool marked `requires_approval` **never executes inline.** First a flood-control guard counts this principal's non-expired pending proposals:
- **exact duplicate** (same `input_sha256` already pending) → `note_violation`, ledger `approval_duplicate`, and a *tool-level* result (`200`, `isError:true`, `status:duplicate`) telling the agent to poll the existing handle. (Tool error, not protocol error — HTTP 200.)
- **over `approval_max_pending_per_principal`** → `note_violation`, ledger `approval_throttled`, `200 isError:true status:queue_full`. Repeat flooding trips Gate 1b.
- **otherwise** → `approval/create` persists the intent (arguments *are* stored here, since execution is deferred), ledger `pending_approval`, and returns `200 isError:false` with an opaque `handle` + `expires_at`.

Idempotency does **not** apply on this branch — the handle is the dedup, and there is no result yet. Deferred execution is section 5.

**Gate 7 — Idempotency (only if `tool.idempotent` and a `_meta.idempotencyKey` was supplied).** Runs *after* authorization, so a cached result is never served to an unauthorized caller. Lookup by `(key, principal)`:
- **hit, but `input_sha256` differs** → same key, different args = client error → ledger (`invalid`, `-32602`) + `-32602 "Idempotency-Key reused with different arguments"` (HTTP 200).
- **hit, args match** → **replay** the stored result without re-executing → ledger `replayed` → `200` with the cached response.
- **miss** → mark `idem_store = true` and fall through to execution (the result will be stored).

**Gate 8 — Execution + attestation.** Two shapes:

- **Mutating tool** — handler and ledger share **one transaction**:
  ```
  transaction
    exec = execute/run(...)
    if exec.outcome == success
        le.execution_outcome = success (+ subject_type/subject_id)
        if idem_store: idempotency/store   ← INSIDE the txn
        ledger/append                      ← INSIDE the txn
        if append succeeded: commit  else: rollback
    else
        rollback
  endtransaction
  unless committed:
        ledger/append(rolled_back, -32003) ← OUTSIDE the txn, so the failure is still audited
  ```
  The mutation, its idempotency record, and its attestation **commit or roll back together** — an action can never exist without its attestation, and a rolled-back call leaves no idempotency record (so a genuine retry re-executes). A handler failure *or* a failed ledger append rolls the whole thing back; the `rolled_back` outcome is then recorded outside the transaction so the failure is never invisible.

- **Read-only tool** — no transaction: `execute/run`, record `exec.outcome` (+subject) to the ledger, and if `idem_store` and success, store the idempotency record.

**Step 10 — Respond.** `execute/result_of` builds the single canonical MCP result (the same shape used for the idempotency cache, so a replay is byte-identical). A handler *business* error is an MCP **tool error** (`isError:true`) — **not** a protocol error — so a protocol-successful call returns `HTTP 200` either way. Internals never leak; only the handler's stable `error.message` surfaces.

---

## 5. Deferred path — an approved action runs later

A `pending_approval` from Gate 6 sits until an operator decides in the console (`views/pages/mcp-admin/approve.liquid` → `commands/approval/execute`). Approval is **not** a rubber stamp — `approval/execute` re-enters the pipeline as the **original principal**:

1. re-resolve the tool (it may have been de-registered or changed),
1b. re-check the **requesting credential**: the token stored on the approval must still be active, still allow the tool (`allowed_tools`) and, for a mutating tool, still carry `mcp:write`; the user must still hold `mcp.tokens.manage`. Otherwise the approval fails with "Requester's access was revoked." — an operator's approval never revives a revoked identity,
2. re-validate the stored arguments against the *current* schema (a failure is an `isError` tool result with `validation_errors`, like the inline call),
3. **re-authorize** against the original principal (rights or policy may have changed since the request),
4. execute inside a transaction and **attest**, linked to the original request by `request_id`.

The operator only *decides*; the action runs with the requester's identity and scope, never the operator's. An expired or already-decided approval cannot execute. The agent learns the outcome by polling `mcp_approval_status` (self-scoped: unknown handle and someone-else's handle both return an identical "not found", so handles can't be enumerated).

---

## 6. What lands in the ledger — the outcome taxonomy

Every authenticated ending writes one chained entry (`ledger/append`: stamps `seq` + `occurred_at`, links `prev_entry_hash`, hashes the canonical payload). The `execution_outcome` tells you exactly where the request ended:

| `execution_outcome` | `authz_decision` | error code | HTTP | Where it ended |
|---|---|---|---|---|
| `error` (rate) | `not_applicable` | `-32004` | 200 | Gate 2 rate limit |
| `invalid` | `not_applicable` | `-32602` | 200 | Gate 3 unknown tool **or** Gate 4 invalid args (`isError` result) **or** Gate 7 key-reuse |
| `denied` | `deny` | `-32001` | 403 / 200 | Gate 3b insufficient scope (403) **or** Gate 5 authorization (200) |
| `approval_duplicate` | `allow` | — | 200 | Gate 6 dedup |
| `approval_throttled` | `allow` | — | 200 | Gate 6 queue full |
| `pending_approval` | `allow` | — | 200 | Gate 6 queued for operator |
| `replayed` | `allow` | — | 200 | Gate 7 idempotent replay |
| `success` | `allow` | — | 200 | Gate 8 executed & committed |
| `rolled_back` | `allow` | `-32003` | 200* | Gate 8 mutating handler/append failed |
| `security/suspend` | `deny` | — | 200 | Gate 1b auto-suspend (separate entry) |

\* A `rolled_back` mutation still returns the handler's tool-error result (`isError:true`, HTTP 200) — the *protocol* call succeeded; the *action* did not.

**Not in the ledger:** pre-auth failures (bad/missing/revoked/unbound token) — platform log only. And the open methods (`initialize`, `ping`, `tools/list`, `resources/*`, `prompts/*`, `logging/setLevel`) — they take no governed action. The one exception is a `resources/read` of an app provider resource, which is ledgered as `method: resources/read` with the outcomes `success`, `invalid` (not found), `denied` (scope), or `error` (rate limit, provider failure) — see 3b.

Only `input_sha256` and the chain hashes are hashed; everything else (tool name, principal, outcome, timings, declared `audit_json`) is plaintext, so the ledger is *readable* — `verify_chain` proves it wasn't altered, and the operator console + metrics read it directly.

---

## 7. The whole picture in one sentence

> One HTTP door (`mcp.json.liquid`) → one router (`rpc/dispatch`) that answers open/discovery methods inline → one governed spine (`rpc/tools_call`) that runs identity → abuse → rate → registry → validation → authorization → (approval | idempotency) → transactional execution, fail-closed at every gate, and attests every authenticated outcome to a hash-chained ledger — while pre-auth noise is turned away at the log, never the chain.

---

### Cross-references
- Per-command reference (what each partial is and why): `engine-commands-architecture.md`
- Normative spec (section numbers cited in the code): `pos-module-mcp-spec.md`
