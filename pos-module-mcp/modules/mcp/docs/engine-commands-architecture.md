# Engine Command Architecture

**Path:** `modules/mcp/public/lib/commands/`

This document explains every command in the MCP engine — what it does and *why it exists*. These commands are **Layer 1: the governance engine** — the reusable, app-independent machinery that turns a platformOS instance into a *governed* MCP server. They are Liquid partials invoked as `function`/`graphql` steps; each one is a single, testable unit with a documented `@param`/`@return` contract.

> **Layer 1 vs Layer 2.** The commands here are the engine. The *tools* an app actually exposes (its business actions) live in Layer 2 (`app/views/partials/mcp/`). The engine never knows what a tool does — it only guarantees that *whatever* the tool does, it happens under identity, validation, authorization, limits, approval, and attestation. That separation is the whole design: an app author writes a tool; the engine makes it safe.

---

## The mental model: one pipeline, seven planes

Every request enters through **one door** (`POST /mcp` → `rpc/dispatch`) and, for the tool-call path, flows through **one spine** (`rpc/tools_call`) that invokes each control in a fixed order:

```
        POST /mcp
            │
      rpc/dispatch            envelope + size cap + method routing
            │
   ┌────────┴─────────┐
   │  rpc/tools_call  │      the spine — steps below run in order
   └────────┬─────────┘
            │
   1. IDENTITY      who is calling?        identity/ · tokens/ · access/
   2. REGISTRY      does this tool exist?  registry/
   3. VALIDATE      are the args legal?    validate/
   4. AUTHORIZE     are they allowed?      authorize/
   5. LIMITS        are they abusing it?   limits/
   6. APPROVAL      needs a human?         approval/ · builtin/
   7. EXECUTE       run it (txn-wrapped)   execute/ · idempotency/
            │
        LEDGER      attest every outcome   ledger/
```

The design rule at every step is **fail-closed**: there is no default-permit, default-accept, or default-serve path anywhere. A missing policy, an unknown keyword, a malformed manifest, a thrown handler — all resolve to *denied* / *excluded* / *error*, never to *allowed by accident*. And **every** post-authentication outcome — success, denial, validation failure, rate-limit, handler crash — is written to the tamper-evident ledger. Attestation is not a feature you opt into; it is the exit of the pipeline.

The controls map to seven governance concerns:

| Plane | Concern | Commands |
|---|---|---|
| **Transport** | Speak the protocol correctly, leak nothing | `rpc/` |
| **Identity** | Who is calling; no standing/confused-deputy credentials | `identity/`, `tokens/`, `access/`, `is_operator` |
| **Registry** | What tools exist; no tool poisoning | `registry/` |
| **Validation** | Are the inputs well-formed and in-bounds | `validate/` |
| **Authorization** | Is this identity allowed this action | `authorize/` |
| **Availability** | Bound the blast radius per identity | `limits/` |
| **Integrity** | Tamper-evident record of what happened | `ledger/`, `observability/` |

Plus two cross-cutting concerns: **human-in-the-loop** (`approval/`, `builtin/`) and **safe retries** (`idempotency/`), and the shared plumbing (`config`, `eval/`, `execute/`).

---

## 1. Transport layer — `rpc/`

The wire protocol (JSON-RPC 2.0, MCP revision 2025-06-18). Everything enters here. These handlers are deliberately thin: they parse, route, and format — they do not make policy decisions.

| Command | What it does | Why we have it |
|---|---|---|
| `rpc/dispatch` | The single entry point behind `POST /mcp`. Validates the JSON-RPC envelope, enforces the transport size cap, routes each method to its `rpc/*` handler, returns a transport-agnostic outcome. | One door means one place to enforce envelope rules and the size cap. Rejects batch arrays (the 2025-06-18 revision removed batching), so the surface never lies about what it accepts. |
| `rpc/initialize` | MCP handshake: capability negotiation + server identity + house-rule `instructions`. Open (no auth, no ledger — pre-auth plumbing). | The client must learn what this server actually implements. `instructions` are model-read text, so they are kept factual and injection-free (security-relevant surface). |
| `rpc/ping` | Liveness — returns `{}`. Open, unledgered. | Cheap health probe that must not require credentials or spam the chain. |
| `rpc/success` | Builds the JSON-RPC success envelope. Pure. | One canonical success shape. |
| `rpc/error` | Builds the JSON-RPC error envelope. Pure. | **The leak guard.** Error messages must never carry stack traces, GraphQL text, or schema/policy internals — only stable, caller-safe strings, with machine context in `data`. Centralizing this makes "don't leak internals" a structural property, not a per-caller discipline. |
| `rpc/tools_list` | Serves the registered, valid tools in MCP wire shape (name + description + inputSchema), cursor-paginated, deprecation in `_meta`. Open method (listing ≠ executing). | Agents need discovery, but discovery must never expose an excluded/invalid tool or bloat context in one page. |
| `rpc/tools_call` | **The spine.** Runs the full call pipeline: authenticate → resolve → validate → authorize → limits → (approval) → execute → attest. | This is the one place a side-effect can happen, so it is the one place every control is enforced in order. Ledger policy lives here: an *authenticated* request writes a chained entry for every outcome; a *pre-auth* failure (bad/missing token — no accountable identity) goes to the platform log only, so anonymous probes can't spam or grow the chain. |
| `rpc/resources_list` | Zero-config: exposes doc/markdown pages as agent-readable resources. OFF by default; only slugs under a configured prefix allowlist are listed. | Lets an operator opt into surfacing docs to agents *without* authoring anything — but nothing is visible unless explicitly enabled. The engine's own pages never match the doc prefixes. |
| `rpc/resources_read` | Returns the markdown of a listed doc page. | **The toggle AND the prefix allowlist are re-checked here** — a crafted `uri` must not read a page outside the allowed prefixes. Never trust the URI to scope access. |
| `rpc/prompts_list` | Returns the registered prompt templates (name/title/description/arguments). Open discovery. | Prompts are reusable, parameterized text the server offers agents. |
| `rpc/prompts_get` | Resolves a prompt, checks required args, renders its template, returns the messages. | The template is reviewed code; args are the agent's; the server never *acts* on the rendered prompt — so there is no injection surface, only text generation. |

---

## 2. Identity — *who is calling?* — `identity/`, `tokens/`, `access/`, `is_operator`

The confidentiality / confused-deputy plane. An MCP server's core risk is a standing credential that lets an agent act with more authority than the human behind it. This plane maps every call back to a **real platformOS user**.

| Command | What it does | Why we have it |
|---|---|---|
| `identity/resolve_principal` | Verifies the Bearer token and maps it to a principal (real platformOS user) + agent identity. Only the token's **sha256 digest** is stored, so a DB read can't recover a usable credential. Fail-closed at every step (missing/malformed header → 401 + `WWW-Authenticate`). Also throttled-stamps `last_used_at` (≤1 write/min/token). | This is *the* confused-deputy control: no anonymous execution, no shared secret, no credential recoverable from storage. `delegation_mode` is carried in the contract so `on_behalf_of` can be added later without changing callers. |
| `identity/deny` | Builds an auth/authz denial outcome. Separates the **caller-safe wire message** from the stable machine **`reason`** recorded in the ledger, and optionally sets `WWW-Authenticate`. | The agent gets a generic reason; the audit trail gets a precise, stable code. You need both, and they must not be the same string (one is public, one is forensic). |
| `tokens/mint` | Generates a random raw bearer, stores **only** its sha256 digest bound to a `user_id`, returns the raw token **once**. | Operator UX for issuing agent credentials. "Show once, store only the digest" means a leaked database never yields a usable token. |
| `access/level` | Computes the current **session** user's MCP access level: `anonymous` / `admin` / `user` / `requested` / `none`. Bootstraps a user in `MCP_ADMIN_USER_IDS` as an active admin even with no row. | Single source of truth for both gates — the operator console (admin) and the token console (admin\|user). The bootstrap guarantees a fresh instance always has a first operator (no chicken-and-egg lockout). |
| `access/decide` | Operator action: upsert a user's MCP access (approve a request, grant a role, revoke). | Access is data an operator manages; this is the one writer. The caller (operator page) owns the operator gate. |
| `is_operator` | Boolean: is the session user an admin operator (`access/level == admin`)? Fail-closed. | The console gate, deliberately distinct from the platform `admin` role — MCP operator ≠ platform superuser. |

---

## 3. Registry — *what tools exist?* — `registry/`

The tool-poisoning plane. **Registration is code, not data.** An app declares its tools in a reviewed registry partial; a tool that isn't declared, or whose manifest fails validation, simply does not exist to the server. This makes "every tool passed review" a structural property.

| Command | What it does | Why we have it |
|---|---|---|
| `registry/build` | Assembles the tool set from the app's registry partial. Each manifest is meta-schema-validated; anything that fails to load, mismatches its declared name, or fails validation is **excluded and logged** — never served degraded. Inert-but-armed: no registry partial → empty tool set, endpoint still live. | The build step is the gate that guarantees the served surface only contains reviewed, valid tools. "Excluded, never degraded" means a broken manifest can never silently serve with weaker guarantees. |
| `registry/load` | The single indirection every caller uses to get the registry (currently a pass-through to `build`). | So caching can be added in exactly one place later (`{% cache %}` auto-invalidates on deploy, which is when the code-defined registry can change) without touching any caller. |
| `registry/resolve_tool` | Resolves a tool name → its validated manifest. Applies per-token `allowed_tools` narrowing (intersect only, never widen). | Only registered + valid tools resolve, so the surface can never execute an unvalidated action. Per-token narrowing lets one agent's credential be scoped to a subset without new policies. |
| `registry/manifest_schema` | Validates **one manifest** against the manifest meta-schema. Hard-requires `authorization_policy`, `mutating`, `requires_approval`; enforces the name/version format; requires `input_schema` to pass the supported-subset walker. | These three fields carry the governance posture (who / reversibility / gate) so a reviewer knows the risk without reading the handler. **No implicit allow:** a blank `authorization_policy` = INVALID. There is no default-permit path. |
| `registry/validate_schema_node` | Validates **one JSON-Schema node** against the supported subset, recursing into `properties.*` and `items`. Any unsupported keyword anywhere → the whole manifest is rejected. | A silently-ignored schema keyword is a security hole, not a convenience: an author must never be able to *declare* a constraint the engine does not *enforce*. Also caps `pattern` length and rejects catastrophic-backtracking patterns. |
| `registry/lint_description` | Scans tool descriptions for model-directed instructions, cross-tool references, permission claims, or encoded blobs — the tool-poisoning tripwire. | Descriptions are model-read text = the primary prompt-injection surface. This flags them for human review (conservative, substring-based, no regex backtracking). False positive = a reviewer's glance; false negative = a poisoned tool ships. |
| `registry/build_prompts` | Same pattern as `build`, for prompt templates: validates name/description/template, excludes + logs invalid ones. | Prompts carry no side effects, so no authz meta-validation — but they are still model-read text and must not be served degraded. |

> **Why registry appears twice in the pipeline.** `registry/build` runs to *produce* the served surface (and feeds `tools/list`); `registry/resolve_tool` runs *per call* to look a name up in that surface. `manifest_schema` + `validate_schema_node` + `lint_description` are the validators `build` calls. `load` is the accessor everyone uses. They are one subsystem with distinct jobs: **build the catalog, validate each entry, resolve one entry per call.**

---

## 4. Validation — *are the arguments legal?* — `validate/`

| Command | What it does | Why we have it |
|---|---|---|
| `validate/json_schema` | Validates a **tool call's arguments** against the tool's (already-valid) input schema. STRICT, no coercion: `"42"` for an integer is **rejected**, not coerced; unknown keys rejected; `additionalProperties` forced false regardless of declaration; depth capped. | This is the input-surface control. Distinct from `registry/validate_schema_node`, which validates the *schema*; this validates a *value* against it. No coercion because agents emit well-formed JSON — lenient coercion hides model errors and widens the attack surface. |

---

## 5. Authorization — *are they allowed?* — `authorize/`

| Command | What it does | Why we have it |
|---|---|---|
| `authorize/evaluate` | Evaluates the tool's **named authorization policy** for the resolved identity, per call. The app provides a policy partial that receives `principal, agent, arguments, tool, delegation_mode` and returns a boolean or `{allow, reason}`. In `on_behalf_of` mode the authoritative subject is the human `principal`, never the agent. | This is where the module earns its name: the semantic control between agent intent and system action. Fail-closed — **no default-permit path**. A buyer's agent inherits the buyer's scope, never its own. |

---

## 6. Availability — *are they abusing it?* — `limits/`

Bounds the blast radius per identity. Not traffic shaping — a containment control.

| Command | What it does | Why we have it |
|---|---|---|
| `limits/check` | Fixed-window per-minute rate limit for one scope (`principal:<id>` / `client:<id>`). Uses platformOS's atomic `increment`, so concurrent bumps don't lose updates. | Caps how fast one identity can act. A find-then-create race at a window boundary can only *under*-count (fails safe / conservative for the limit), never over-count. |
| `limits/note_violation` | Records one policy violation into the principal's current abuse window. O(1) counter (same mechanism as the rate limiter), **not** a ledger scan. Called at each violation exit (deny / invalid args / unknown tool / rate-limit). | A cheap tripwire that feeds abuse detection without touching the audit surface. |
| `limits/enforce_abuse` | Reads the windowed violation counter; over threshold it **suspends the token** (status → revoked, so the next call fails auth) and writes a `security/suspend` ledger entry. Runs on every authenticated call. | Auto-suspend is a *real* control, not a warning message. Deliberately O(1): an earlier version scanned up to 100 ledger rows here, which grew with the ledger and blew the per-request budget, intermittently corrupting later pipeline steps. **Never scan the ledger on the hot path.** |

---

## 7. Human-in-the-loop — `approval/`, `builtin/`

For tools declared `requires_approval`: the action does not run at request time; an operator decides later, and it runs with the **original requester's** identity.

| Command | What it does | Why we have it |
|---|---|---|
| `approval/create` | Records a pending approval and returns an opaque handle. Arguments are persisted (unlike the ledger) because execution is deferred. | Some actions are too consequential to run on agent say-so alone. This captures intent for later, after the requester is already authenticated + authorized to *request* it. |
| `approval/execute` | Runs an **approved** action as the original principal, first re-resolving the tool, re-validating the args, and **re-authorizing** — then executing in a transaction and attesting, linked by `request_id`. | Defense in depth: between request and approval, the tool, its schema, its policy, or the principal's rights may have changed. The operator only *decides*; the action runs with the requester's identity and scope, never the operator's. |
| `builtin/approval_status` | The built-in `mcp_approval_status` tool: an agent polls the status of an action it requested. Self-scoped. | An agent needs to know if its deferred action ran. Self-scoping matters: an unknown handle and someone else's handle both return identical "not found", so handles cannot be enumerated. |

---

## 8. Safe retries — `idempotency/`

| Command | What it does | Why we have it |
|---|---|---|
| `idempotency/lookup` | Returns a prior result for `(key, principal)`; expired entries treated as absent. | Lets a retried call replay its original result instead of double-executing. **Scoped by principal** so one member's key can't replay another's result. |
| `idempotency/store` | Persists the result **inside the business transaction**, so the mutation and the replay record commit or roll back together. `input_sha256` guards key reuse with different args. | Guarantees a mutation can never commit without its replay record, and a rolled-back call leaves no record (so a genuine retry re-executes). This atomicity is why retries are safe under failure. |

---

## 9. Execution — `execute/`

| Command | What it does | Why we have it |
|---|---|---|
| `execute/run` | Invokes the resolved / validated / authorized tool handler and maps its `{ ok, result?, subject?, error? }` return to an MCP result. A handler that throws or returns a malformed shape is caught → generic tool error (fail-safe). | The one place a tool actually runs, after every gate has passed. `ok:false` is a *tool* error (the agent can reason about a business failure), not a protocol error — and internals never leak. For mutating tools this is the transaction boundary. |
| `execute/result_of` | Builds the single canonical MCP result shape used for **both** the response and the idempotency cache. | So a replayed result is byte-identical to the original — one shape, one source of truth. |

---

## 10. Integrity — the ledger — `ledger/`

The tamper-evident audit plane: an append-only, hash-chained record where each entry commits to all prior entries. Editing, reordering, backdating, or forking any entry breaks the chain and is detectable.

| Command | What it does | Why we have it |
|---|---|---|
| `ledger/append` | Writes one chained entry on **every** post-auth outcome. Stamps `seq` + `occurred_at`, links `prev_entry_hash` to the current tail, computes `entry_hash` over the canonical payload, writes the row. Inside a `{% transaction %}` it commits atomically with the business mutation. Never receives raw arguments — only `input_sha256` + `input_bytes` (+ declared-safe `audit_json`). | Attestation cannot exist without its action, and an action cannot commit without its attestation. This is what makes the ledger a *record of what actually happened*, not a log that can drift from reality. |
| `ledger/canonical` | Canonical serialization of an entry payload: fixed key order, every key always emitted (absent → null), explicit per-type coercion (`"84"` and `84` serialize identically). | **Single source of truth** for hashing. Both `append` (fresh entry) and `verify_chain` (entry read back from the DB as strings) call it, so the hash is reproducible regardless of how values arrive. Without this shared serializer, DB round-tripping would produce false chain breaks. |
| `ledger/verify_chain` | Walks **every** entry in creation order (id ASC), re-derives each `entry_hash` with the same canonical serializer, and checks two invariants — linkage (`prev_entry_hash` == previous entry's hash) and integrity (`digest(canonical(payload) ‖ prev_entry_hash)` == `entry_hash`). Returns the first break. | The full audit. A tamper anywhere invalidates every later entry, so reporting the earliest break is sufficient. This is the command that *proves* the ledger is intact. |
| `ledger/verify_chain_recent` | Bounded version over the most recent `limit` entries (default 200). Same invariants, same serializer. Verifies from genesis if the window contains it; otherwise anchors on the oldest fetched row and verifies forward. | So the operator console's per-load integrity check does not grow in cost with the whole ledger. The concurrency-fork case is always a recent append, so a bounded tail catches it; older-entry tampering is surfaced by the on-demand full walk. |

---

## 11. Observability — `observability/`

| Command | What it does | Why we have it |
|---|---|---|
| `observability/metrics` | Aggregates counts / rates / latency from the ledger (paged, capped by `max_pages`) plus the chain-verification status. `chain_tail` selects the bounded vs. full verifier. | The ledger is the single source of truth for what agents did, so metrics are *derived* from it, not tracked separately (they can never disagree). The chain status is the page-immediately alert signal for the operator. |

---

## 12. Shared plumbing — `config`, `eval/`

| Command | What it does | Why we have it |
|---|---|---|
| `config` | Resolves the effective module configuration. Layer-1 defaults live here (so the engine is inert-but-armed with sane values on install); an app overrides any key via an `MCP_CONFIG` instance constant merged over the defaults. | Operators tune limits/paths/versions **without forking the module**. Read once per request and reused. |
| `eval/run` | Deterministic surface-health eval: every served tool has a real (≥20 char), unique, non-poisoned description; each golden case's expected tool still resolves and its example args still validate. | Measures whether the tool surface degrades silently as it grows (bad descriptions quietly wreck model tool-selection). The module never calls LLMs itself, so the "did the descriptions actually lead the model here" check lives in the external runner; this command is the deterministic core. |

---

## Why this shape

Three principles explain every choice above:

1. **One door, one spine, fixed order.** Because there is exactly one entry (`rpc/dispatch`) and one call path (`rpc/tools_call`) that runs controls in a fixed sequence, there is no code path that reaches execution having skipped a gate. Security becomes a property of the *structure*, not of remembering to call things.

2. **Fail-closed everywhere, no implicit allow.** Missing policy → invalid. Unknown schema keyword → manifest rejected. Malformed manifest → excluded, never degraded. Thrown handler → generic error. Bad token → 401, unledgered. The default is always *deny/exclude/error*, never *permit*.

3. **The ledger is the ground truth.** Every post-auth outcome is attested, atomically with any mutation, in a hash-chained record whose integrity is verifiable. Metrics derive from it; the console reads it; an auditor can prove it wasn't altered. Nothing the engine does is un-recorded, and the record cannot be quietly rewritten.

Each command exists to make one of those three true for one step of the pipeline. Remove any of them and a specific guarantee disappears — that is the "why we have what."
