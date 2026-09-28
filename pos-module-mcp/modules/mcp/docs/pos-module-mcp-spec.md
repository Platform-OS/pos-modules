# pos-module-mcp — Implementation Specification

**Status:** Draft v0.1 — internal
**Owner:** _TBD_
**Last updated:** 2026-07-23

---

## Reading note: the `⚠ VERIFY` convention

This spec is written against platformOS primitives as documented publicly through mid-2026. Where the exact tag name, filter name, or runtime behaviour needs confirmation against the current engine before implementation, the line is marked `⚠ VERIFY`. These are not optional details — several of them (raw request body access, digest filters, page HTTP methods) are load-bearing, and if one turns out to be unavailable, the affected section needs redesign rather than a workaround. Resolve all `⚠ VERIFY` items before Phase 1 estimation.

---

## 1. Purpose

`pos-module-mcp` turns a platformOS instance into a Model Context Protocol server, so that an external agent (Claude, ChatGPT, a partner's internal agent) can read that instance's data and invoke its business logic through an interface that is **typed, identity-bound, authorized, reversible, and attested**.

The module exists because the failure mode of the MCP ecosystem is well documented and structural: there is no control operating at the semantic layer between an agent's intent and the system action it triggers. Independent scans through 2026 repeatedly found the majority of public MCP servers carrying exploitable flaws, a small minority implementing OAuth, and most running as local processes on standing credentials. Every one of those gaps corresponds to a control platformOS already has:

| MCP ecosystem gap | platformOS primitive that closes it |
|---|---|
| No per-action authorization; standing credentials | Named authorization policies, evaluated per call against a resolved identity |
| Partial state after a failed agent plan | `transaction` / `rollback` Liquid tags |
| Unvalidated, free-form tool input | Typed GraphQL schema + declared JSON Schema per tool |
| Unaudited action history | Records + append-only ledger with denied mutations |
| Shared, unscoped process | Per-instance tenancy and auth tokens |

The module is the assembly of those primitives into an MCP surface. **It is not a way to expose GraphQL to an LLM.** That is the anti-pattern it exists to prevent (§4.1).

### 1.1 Consumers

- Buyer/seller/operator agents acting against a pOS marketplace instance.
- Partner-internal agents performing operational tasks against a pOS SaaS instance.
- Agent-mediated discovery surfaces reading catalogue and content data.

### 1.2 What it replaces

A partner writing a bespoke MCP server in Node, holding a standing admin API token, with no per-action authorization, no rollback, and an ad-hoc audit trail.

---

## 2. Non-goals

The following are explicitly out of scope for v1 and should be rejected in review if proposed:

- **Runtime GraphQL introspection into tools.** See §4.1.
- **Hosting or proxying model inference.** The module is a server, not a client. It does not call LLMs.
- **Agent orchestration, planning, or memory.** Those belong to the agent, not the platform.
- **A generic `run_graphql` / `execute_liquid` escape-hatch tool.** Under no configuration.
- **Content provenance for generative outputs.** That is a separate module (`pos-module-provenance`); this module's ledger is designed to be its sink (§11.5), but the two ship independently.
- **Article 50 disclosure rendering.** Separate concern, separate module.

---

## 3. Architecture

### 3.1 Two layers

**Layer 1 — the module.** Identical on every instance. Contains the machinery of governance and zero business logic: JSON-RPC transport, identity resolution, schema validation, authorization dispatch, transaction wrapping, the attestation ledger, tool/resource discovery, error mapping.

**Layer 2 — the app's tools.** Unique per instance. The application declares its own tools, referencing its own commands and its own authorization policies. All business meaning lives here, authored by whoever builds that instance's app.

The module is **inert-but-armed** on install: endpoint live, auth wired, ledger table created, tool registry empty. It becomes useful when the app registers tools.

### 3.2 What works with zero app configuration

One capability is genuinely universal: **MCP resources over the `.md` page endpoint.** Pages using the markdown converter already expose `/:slug.md`, a format explicitly intended for agent consumption. On install, the module can enumerate eligible pages and serve them as MCP resources — governed, rate-limited, freshness-stamped — with no custom authoring.

**Tools never work on install, and should not.** An action is business-specific by definition; there is no universal "reprice a listing". Reads can be partly generic; writes must be authored. This asymmetry is intentional and should be preserved.

### 3.3 Component diagram (logical)

```
Agent (MCP client)
   │  HTTPS + JSON-RPC 2.0, Bearer token
   ▼
┌─────────────────────────────────────────────────────┐
│ pos-module-mcp                                      │
│                                                     │
│  transport/   JSON-RPC parse, dispatch, error map   │
│  identity/    token → principal + delegation        │
│  registry/    tool + resource discovery, tools/list │
│  validate/    JSON Schema check of arguments        │
│  authorize/   named policy evaluation               │
│  execute/     transaction wrap, handler invoke      │
│  ledger/      append-only chained attestation       │
│  limits/      rate limiting, quota, size caps       │
└─────────────────────────────────────────────────────┘
   │                              │
   ▼                              ▼
app/mcp/tools/*  (Layer 2)   app pages (.md resources)
   │
   ▼
app commands → GraphQL mutations/queries → data
```

---

## 4. Key design decisions

### 4.1 Tools are curated commands, never introspected schema

Auto-generating one tool per GraphQL query/mutation is rejected on four grounds:

1. **Context bloat.** A full schema overwhelms the agent's tool list and measurably degrades tool selection.
2. **No business semantics.** `record_update` is not a safe tool; `reprice_listing` is. A raw mutation carries no invariants, so an agent can drive data into states the business rules would never permit.
3. **Unreviewed descriptions.** Tool descriptions are read by the model at runtime and are the primary injection surface. Auto-generated descriptions are unaudited by definition.
4. **Wrong authorization granularity.** pOS enforces authorization at the command/policy layer. Raw mutation exposure bypasses exactly the control that makes this module worth building.

**Generation is permitted at dev time only** (§8.4): a scaffolder emits *draft* manifests for a human to constrain. The shipped artifact is always the reviewed manifest.

### 4.2 Registration is code, not data, by default

Tool manifests are static files under version control. This is not a convenience preference — it is the tool-poisoning mitigation stated as a structural property: every tool description that reaches an agent passed code review. A dynamic, record-based registry is available as a gated option (§8.3) with the tradeoff documented.

### 4.3 Attestation is inside the transaction

The ledger write and the business mutation commit or fail together. An action cannot exist without its attestation. This is what makes the audit trail a guarantee rather than a best effort.

---

## 5. Repository layout

### 5.1 Module

```
pos-module-mcp/
  pos-module.json
  app/
    config.yml
    schema/
      mcp_ledger.yml
      mcp_tool_registration.yml        # optional dynamic registry
      mcp_pending_approval.yml
      mcp_client.yml
    views/
      pages/
        mcp.liquid                     # POST endpoint, JSON-RPC
        mcp_sse.liquid                 # Phase 4
        well-known/
          oauth-protected-resource.liquid
      partials/
        transport/
          parse_request.liquid
          error_response.liquid
          success_response.liquid
        registry/
          discover_tools.liquid
          discover_resources.liquid
          resolve_tool.liquid
        identity/
          resolve_principal.liquid
        validate/
          json_schema.liquid
        authorize/
          evaluate.liquid
        ledger/
          append.liquid
          verify_chain.liquid
        limits/
          check.liquid
    lib/
      commands/
        rpc/
          initialize.liquid
          tools_list.liquid
          tools_call.liquid
          resources_list.liquid
          resources_read.liquid
          prompts_list.liquid
          prompts_get.liquid
      queries/
        ledger/search.liquid
        tools/find_by_name.liquid
    authorization_policies/
      mcp_ledger_immutable.liquid
      mcp_admin_only.liquid
  docs/
    authoring-tools.md
    security-model.md
    upgrade-notes.md
```

### 5.2 App (Layer 2), for reference

```
app/
  mcp/
    tools/
      reprice_listing/
        manifest.yml
        call.liquid
      cancel_order/
        manifest.yml
        call.liquid
    resources/
      catalog_index/
        manifest.yml
```

---

## 6. Data model

All tables under `app/schema/`. Field types follow pOS conventions. `⚠ VERIFY` exact type names against current schema docs before implementation.

### 6.1 `mcp_ledger` — append-only attestation

```yaml
name: mcp_ledger
fields:
  seq:                  { type: integer }    # monotonic per instance
  occurred_at:          { type: datetime }
  method:               { type: string }     # tools/call, resources/read, …
  tool_name:            { type: string }
  tool_version:         { type: string }
  client_id:            { type: string }     # registered MCP client
  agent_id:             { type: string }     # identity of the calling agent
  principal_id:         { type: string }     # delegated human principal
  delegation_mode:      { type: string }     # direct | on_behalf_of
  input_sha256:         { type: string }     # hash only — never raw arguments
  input_bytes:          { type: integer }
  authz_policy:         { type: string }
  authz_decision:       { type: string }     # allow | deny | not_applicable
  authz_reason:         { type: string }
  execution_outcome:    { type: string }     # success | error | rolled_back | pending_approval
  error_code:           { type: integer }
  duration_ms:          { type: integer }
  subject_type:         { type: string }     # record | asset | none
  subject_id:           { type: string }
  prev_entry_hash:      { type: string }
  entry_hash:           { type: string }
```

**Chaining.** `entry_hash = sha256(canonical_json(entry_payload) || prev_entry_hash)`, where `entry_payload` excludes both hash fields. `prev_entry_hash` of the first entry is 64 zeros. Any backdating or edit breaks the chain and is detectable by `ledger/verify_chain`.

`⚠ VERIFY` a SHA-256 digest filter is available in Liquid on the current engine. If only weaker digests exist, escalate — this is load-bearing and a fallback of HMAC-with-instance-secret changes the threat model (detects tampering by outsiders, not by an actor with the secret).

**Immutability.** An authorization policy denies `update` and `delete` on this table to all identities including admins (§12.6). Retention is by export-then-purge under an explicit admin action that is itself logged, never by ad-hoc deletion.

**Hashing, not storing, inputs.** Tool arguments may contain personal data. The ledger is a long-retention compliance artifact; it must not become an uncontrolled PII store. Store `input_sha256` and `input_bytes`. If a specific tool needs argument-level auditability, it declares `audit_fields` in its manifest naming the non-sensitive fields to record explicitly.

### 6.2 `mcp_client` — registered agent clients

```yaml
name: mcp_client
fields:
  client_id:            { type: string }
  display_name:         { type: string }
  status:               { type: string }     # active | suspended | revoked
  allowed_tools:        { type: array }      # optional narrowing of the global set
  rate_limit_per_min:   { type: integer }
  max_input_bytes:      { type: integer }
  contact:              { type: string }
  registered_at:        { type: datetime }
  last_seen_at:         { type: datetime }
```

`allowed_tools` narrows but never widens: the effective tool set is the intersection of registered tools, this list (when present), and per-call authorization outcomes.

### 6.3 `mcp_pending_approval` — human-in-the-loop gate

```yaml
name: mcp_pending_approval
fields:
  handle:               { type: string }     # opaque, returned to agent
  tool_name:            { type: string }
  arguments_json:       { type: text }       # encrypted or access-restricted
  requested_by_agent:   { type: string }
  principal_id:         { type: string }
  status:               { type: string }     # pending | approved | rejected | expired | executed
  decided_by:           { type: string }
  decided_at:           { type: datetime }
  expires_at:           { type: datetime }
  result_summary:       { type: text }
```

Arguments must be persisted here (unlike the ledger) because execution is deferred. Access is admin-restricted by policy, and entries are purged on a short cycle after terminal status.

### 6.4 `mcp_tool_registration` — optional dynamic registry

```yaml
name: mcp_tool_registration
fields:
  name:                 { type: string }
  version:              { type: string }
  description:          { type: text }
  input_schema_json:    { type: text }
  mutating:             { type: boolean }
  authorization_policy: { type: string }
  requires_approval:    { type: boolean }
  handler_path:         { type: string }
  status:               { type: string }     # draft | review | active | deprecated
  authored_by:          { type: string }
  reviewed_by:          { type: string }
  reviewed_at:          { type: datetime }
```

Only `status: active` rows are served, and a row cannot reach `active` without `reviewed_by` set. See §8.3 for the threat tradeoff.

---

## 7. Tool declaration format

### 7.1 Manifest

`app/mcp/tools/<tool_name>/manifest.yml`:

```yaml
name: reprice_listing
version: "1.2.0"
description: >
  Set the price of a listing owned by the calling principal. Price is given in
  minor currency units. Rejects prices outside the listing category's configured
  band. Does not change currency, availability, or listing status.
input_schema:
  type: object
  additionalProperties: false
  required: [listing_id, price_minor]
  properties:
    listing_id:
      type: string
      description: ID of the listing to reprice.
    price_minor:
      type: integer
      minimum: 1
      description: New price in minor units of the listing's existing currency.
output_schema:                      # optional but recommended
  type: object
  properties:
    listing_id:   { type: string }
    price_minor:  { type: integer }
    changed:      { type: boolean }
mutating: true
authorization_policy: listing_owner_can_edit
requires_approval: false
idempotent: false
audit_fields: [listing_id]
timeout_ms: 5000
handler: app/mcp/tools/reprice_listing/call
deprecated: false
```

### 7.2 Field semantics

| Field | Required | Meaning |
|---|---|---|
| `name` | yes | Unique per instance. `^[a-z][a-z0-9_]{2,63}$`. |
| `version` | yes | SemVer. Surfaced in `tools/list` and the ledger (§14). |
| `description` | yes | Read by the model. Reviewed as security-relevant text (§12.1). |
| `input_schema` | yes | JSON Schema subset (§10.1). `additionalProperties: false` is enforced regardless of declaration. |
| `output_schema` | no | Advisory; enables client-side validation and clearer errors. |
| `mutating` | yes | `true` ⇒ handler runs inside a transaction (§11). |
| `authorization_policy` | yes | Named pOS policy. A tool with no policy is invalid (§12.2 — no implicit allow). |
| `requires_approval` | yes | `true` ⇒ never executes inline; creates a pending approval (§9.6). |
| `idempotent` | no | Declares safe retry; enables idempotency-key handling (§16.3). |
| `audit_fields` | no | Argument keys recorded verbatim in the ledger. Must be non-sensitive. |
| `timeout_ms` | no | Handler budget. Defaults from module config. |
| `handler` | yes | Path to the Liquid command invoked with validated arguments. |
| `deprecated` | no | Still callable; flagged in `tools/list` (§14.2). |

Three fields carry the entire governance posture — `authorization_policy` (who), `mutating` (reversibility), `requires_approval` (human gate) — and they are declarative precisely so a reviewer reads the manifest and knows the tool's risk profile without reading the handler.

### 7.3 Handler contract

The handler is an ordinary Liquid command. It receives:

- `arguments` — hash, already schema-validated and coerced.
- `principal` — resolved identity (§9).
- `agent` — calling agent/client identity.
- `context_meta` — `{ tool_name, tool_version, request_id, ledger_seq }`.

It returns a hash:

```liquid
{
  "ok": true,
  "result": { ... },              # serialised to MCP content
  "subject": { "type": "record", "id": "…" },   # optional, for ledger
  "error": null
}
```

On `ok: false` it returns `error: { code, message, retryable }`. The module maps this to a JSON-RPC error (§13) and, for mutating tools, triggers rollback.

**Handler rules (enforced in review, and by lint where possible):**

- Never interpolate `arguments` into GraphQL query strings. Pass as typed variables. String concatenation into queries is the injection path and is a blocking review finding.
- Never call an external URL supplied in `arguments`. External calls use fixed endpoints inside the handler (§12.5).
- Never write to `mcp_ledger` directly.
- Do not enqueue background jobs without returning a job handle (§16.1).

---

## 8. Registration and discovery

### 8.1 Discovery mechanism

At request time (with caching, §17.2) the module builds its registry by:

1. Reading the app's module manifest declaration block (see §8.2) for the list of **registered** tool names.
2. Walking `app/mcp/tools/*/manifest.yml` and loading those whose names appear in that list.
3. Optionally merging `mcp_tool_registration` rows with `status: active` (§8.3).
4. Validating every manifest against the manifest meta-schema; invalid manifests are **excluded and logged**, never served in a degraded form.

`⚠ VERIFY` the mechanism for a module to enumerate files under an app-owned path at runtime. If runtime file enumeration is unavailable, discovery falls back to explicit declaration in the app's manifest (below) with each entry naming its manifest path — which is the safer design anyway, and may simply become the only mechanism.

### 8.2 Explicit registration (decided)

**Decision: a tool is served only if it is explicitly registered in the app's module manifest.** Presence of a directory is necessary but not sufficient.

```json
{
  "name": "acme-marketplace",
  "mcp": {
    "enabled": true,
    "tools": [
      { "name": "reprice_listing", "path": "app/mcp/tools/reprice_listing" },
      { "name": "cancel_order",    "path": "app/mcp/tools/cancel_order" }
    ],
    "resources": [
      { "name": "catalog_index",   "path": "app/mcp/resources/catalog_index" }
    ]
  }
}
```

Rationale: directory-scan is friction-free but means dropping a folder ships a live agent-callable tool. Explicit registration costs one line and makes activation an auditable, reviewable event. Given that the module's entire value proposition is governance, the safe default is the correct default. This resolves the open question flagged in earlier design discussion.

`⚠ VERIFY` that `pos-module.json` supports arbitrary namespaced blocks, or determine the correct location for this declaration.

### 8.3 Dynamic registration (optional, gated)

Where an operator must define tools without a deploy, `mcp_tool_registration` rows may be merged into the registry, subject to **all** of:

- Authoring restricted to an admin policy.
- `status` transitions to `active` require `reviewed_by` distinct from `authored_by`.
- `description` and `input_schema_json` pass the same meta-schema validation as file manifests.
- `handler_path` must resolve to an existing file-based handler — **dynamic registration may not introduce new executable code**, only new declarations over existing handlers.
- Every status transition is written to the ledger.

The tradeoff must be documented for the operator: the injection surface becomes data rather than reviewed code. This path is off by default (`config.mcp.dynamic_registration: false`).

### 8.4 Dev-time scaffolding

A `pos-cli` subcommand (`pos-cli mcp scaffold-tool`) reads the instance's GraphQL schema and emits a **draft** manifest plus handler stub — e.g. a `reprice_listing` wired to a `record_update` on listings, with `authorization_policy` unset and constraints as TODOs. The developer narrows it: adds the price-band validation, selects the policy, decides `requires_approval`.

This is propose-then-validate: the generator proposes, the schema and the reviewer constrain. It accelerates authoring and **never reaches an agent unreviewed** — a draft manifest fails the meta-schema (`authorization_policy` unset) and is excluded from the registry until completed. This is the legitimate home for the roadmap's "AI-powered code generator" ask without reopening the auto-exposure hole.

---

## 9. Request lifecycle

### 9.1 Transport

Single page endpoint at `/mcp`, `method: post`, `Content-Type: application/json`.

`⚠ VERIFY` (a) pOS pages accept POST with a declared method in front matter; (b) the raw request body is accessible for JSON-RPC parsing — `context.post` may present form-decoded params rather than a raw JSON body. If a raw body is unavailable, this is a blocking issue requiring platform support, not an app-level workaround.

### 9.2 Sequence — `tools/call`

```
 1. Parse       JSON-RPC envelope; validate jsonrpc/id/method/params shape
 2. Limit       size cap, per-client rate limit, concurrency guard
 3. Authenticate  Bearer token → verify signature/expiry → resolve principal
 4. Resolve     tool name → registry entry (404-equivalent if absent)
 5. Validate    arguments against input_schema; coerce; reject unknown keys
 6. Authorize   evaluate named policy against (principal, tool, arguments)
 7. Gate        if requires_approval → create pending record, return handle
 8. Execute     if mutating → open transaction
                   invoke handler
                   on handler error or guardrail rejection → rollback
 9. Attest      append ledger entry (inside the same transaction)
10. Respond     JSON-RPC result | error
```

Steps 3, 6, 8, 9 are the four governance planes. Everything else is protocol plumbing.

### 9.3 Failure short-circuits

Every step from 2 onward can terminate the request. **Every termination from step 3 onward writes a ledger entry**, including denials and validation failures. A denied call is at least as security-relevant as a successful one; a ledger that records only successes is useless for incident response.

### 9.4 Identity resolution

The bearer token is verified and mapped to a pOS identity. Two modes:

- **`direct`** — the agent is itself a registered principal with its own scoped permissions. Suitable for operational/back-office agents.
- **`on_behalf_of`** — the token carries both the agent identity and a delegated human principal. Authorization policies evaluate against the **principal**; the ledger records **both**. This is the correct mode for consumer-facing agentic commerce: a buyer's agent must inherit the buyer's scope, never hold its own.

**Decision:** both modes are supported from v1, selected by token claims, because retrofitting delegation is expensive and the on-behalf-of case is the one the market is moving toward. The token format must therefore carry `sub` (principal) and `azp`/`act` (agent) distinctly from day one.

`⚠ VERIFY` current JWT filter capabilities (verification algorithms, claim access, expiry enforcement) — the June 2026 release notes reference `jwt_token` expiry and JWT authentication hardening; confirm what is available.

### 9.5 OAuth posture

MCP is standardising on OAuth 2.1 with the server acting as resource server. v1 implements:

- Bearer token validation against a configured issuer/JWKS.
- `/.well-known/oauth-protected-resource` advertising the authorization server and resource identifier.
- Per-instance resource identifier (multi-tenancy, §15).
- `401` with `WWW-Authenticate` on missing/invalid tokens, per spec.

Full authorization-server responsibilities (dynamic client registration, token issuance) are **out of scope**; the instance is a resource server pointing at an existing AS.

### 9.6 Approval gate

For `requires_approval: true`, the module creates an `mcp_pending_approval` row and returns a structured result telling the agent the action is pending, with an opaque `handle` and the expiry. The agent may poll a companion tool (`mcp_approval_status`, provided by the module) or the operator approves in admin UI, at which point execution proceeds through the same pipeline with a ledger entry linked to the original request.

Approval is not a cosmetic confirmation dialog — it is the control that keeps genuinely high-impact actions (refunds above threshold, account deletion, payout changes) out of autonomous execution while still letting agents *propose* them.

---

## 10. Validation

### 10.1 Supported JSON Schema subset

Full JSON Schema in Liquid is impractical. v1 supports:

- `type`: `object`, `string`, `integer`, `number`, `boolean`, `array`
- `required`, `properties`, `additionalProperties: false` (forced)
- `enum`
- `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`
- `minLength`, `maxLength`, `pattern` (bounded regex, §16.4)
- `items` (single schema), `minItems`, `maxItems`
- `format`: `date-time`, `email`, `uuid` (advisory, validated where cheap)

Unsupported keywords in a manifest cause **manifest rejection at load**, not silent ignoring. An implementer must never be able to declare a constraint the module does not enforce.

Nesting depth is capped (default 5) and total argument size is capped (default 64 KB, per-client overridable downward).

### 10.2 Coercion

Strict by default: a string `"42"` for an `integer` field is rejected, not coerced. Agents produce well-formed JSON; lenient coercion hides model errors and widens the input surface.

---

## 11. Execution and reversibility

### 11.1 Transaction wrapping

Every `mutating: true` tool executes inside a `transaction` block with `rollback` on any of: handler-reported error, unhandled runtime error, timeout, guardrail rejection, or ledger append failure.

`⚠ VERIFY` semantics of the `transaction`/`rollback` tags added in the Nov 2025 release — specifically whether they cover all mutation paths used by handlers, and their interaction with background jobs (§16.1) and external API calls (§11.3).

### 11.2 Why this matters commercially, not just technically

Reversibility is the property that makes an operator psychologically willing to let an agent **write** at all. "It can act, and anything wrong is undone atomically" is a sentence a risk-averse marketplace operator can accept. Without it, agents stay read-only indefinitely. This should be stated plainly in partner-facing docs.

### 11.3 What transactions cannot undo

External side effects — emails, SMS, payment captures, third-party API calls — are **not** transactional. Rules:

- Handlers must not perform irreversible external side effects inline.
- Side effects are enqueued as post-commit background work, never executed before commit.
- Tools whose primary purpose is an irreversible external effect must set `requires_approval: true`.

This is a documented limitation, not a solved problem. Do not claim otherwise in partner materials.

### 11.4 Transactional sessions (Phase 4)

For multi-tool agent plans, an optional session wraps several calls in one transaction with an explicit commit/abort. Deferred — the per-call guarantee delivers most of the value and sessions introduce long-held locks.

### 11.5 Ledger as provenance sink

When an agent action produces user-visible content, the ledger entry carries `subject_type`/`subject_id`, making it the natural join point for a provenance module: the record that says "agent X, on behalf of principal Y, created listing Z" is simultaneously the audit entry and the provenance attestation. The two products share one store. This module does not implement provenance semantics; it makes them cheap to add.

---

## 12. Security model

### 12.1 Threat mapping

| Threat (OWASP agentic / MCP Top 10 families) | Control in this module |
|---|---|
| Tool poisoning — instructions hidden in tool metadata | Descriptions and schemas are static, version-controlled, code-reviewed (§4.2). Never user-supplied, never dynamically fetched. Dynamic registry (§8.3) requires two-person review. |
| Confused deputy / standing credentials | Identity binding (§9.4). The agent never holds an instance token; every call authorized as the mapped principal. |
| Over-broad scope / tool shadowing | Finite explicit tool set (§8.2), each individually policy-gated. No generic execution tool exists to escape through. |
| Direct and indirect prompt injection reaching execution | Arguments are schema-validated and passed as typed GraphQL variables, never concatenated into query strings. Agent input is data, never code. |
| SSRF via agent-supplied URLs | Handlers use fixed external endpoints; agent-supplied URLs are never fetched (§7.3). |
| Command injection | No shell surface exists in the Liquid execution model. |
| Partial-state corruption | Transactions (§11). |
| Backdated or tampered audit logs | Hash-chained ledger with mutation denied by policy (§6.1, §12.6). |
| Autonomous execution of high-impact actions | `requires_approval` gate (§9.6). |
| Shadow MCP servers outside governance | Module is the sanctioned path; partner guidance must state that bespoke servers forfeit these controls. |
| Context over-sharing across sessions | No cross-request agent memory is stored by the module. |

### 12.2 No implicit allow

A tool without `authorization_policy` is an invalid manifest and is excluded from the registry. There is no default-permit path, no "public tool" shortcut. A tool intended for anonymous access declares a policy that explicitly permits it — making the decision visible in review.

### 12.3 Description review discipline

Because tool descriptions are model-read text, PR review of any `manifest.yml` change must treat `description` as security-relevant. Reviewers check for: imperative instructions aimed at the model, references to other tools, claims about permissions, and encoded content. A lint rule should flag suspicious patterns (`ignore`, `system`, `you must`, base64-like blobs) for human attention.

### 12.4 Rate limiting and quotas

Per-client and per-principal limits on requests/minute, concurrent calls, and total argument bytes. Agents evaluate options in parallel rather than sequentially, so limits must be sized for burst patterns — but the ceiling exists to bound blast radius, not to shape traffic.

### 12.5 Egress discipline

Handlers making external calls use configured constants for endpoints. No handler may take a URL, host, or path from `arguments`.

### 12.6 Ledger immutability policy

`mcp_ledger_immutable.liquid` denies `update` and `delete` for all identities. Admin retention operations go through an explicit export-then-purge command that itself appends a ledger entry recording the purge boundary.

---

## 13. Protocol surface and errors

### 13.1 Methods implemented

| Method | Phase | Notes |
|---|---|---|
| `initialize` | 1 | Capability negotiation, protocol version, server info |
| `tools/list` | 1 | Paginated (§14.3) |
| `tools/call` | 1 | Read tools P1, mutating tools P2 |
| `resources/list` | 1 | `.md` pages + declared resources |
| `resources/read` | 1 | |
| `resources/templates/list` | 3 | |
| `prompts/list`, `prompts/get` | 3 | |
| `ping` | 1 | |
| `logging/setLevel` | 3 | |
| Notifications (`*/list_changed`) | 4 | Requires streaming (§16.2) |

`⚠ VERIFY` the target MCP protocol revision at implementation time and pin it in `initialize`. The protocol has revised repeatedly; the spec version must be explicit, not implicit.

### 13.2 Error mapping

| Condition | JSON-RPC code | HTTP | Ledger |
|---|---|---|---|
| Malformed JSON | `-32700` | 400 | no (pre-auth) |
| Invalid request shape | `-32600` | 400 | no |
| Unknown method | `-32601` | 400 | no |
| Unknown tool | `-32602` | 400 | yes |
| Schema validation failure | `-32602` | 400 | yes |
| Missing/invalid token | — | 401 + `WWW-Authenticate` | yes (minimal) |
| Authorization denied | `-32001` | 403 | yes |
| Rate limited | `-32002` | 429 + `Retry-After` | yes |
| Handler error | `-32003` | 200 (tool error) | yes |
| Timeout | `-32004` | 200 | yes |
| Pending approval | not an error | 200 | yes |

Tool *execution* failures are returned as MCP tool errors (`isError: true` in the result) rather than protocol errors, so the agent can reason about them. Protocol-level errors mean the call was malformed or refused.

**Error messages must not leak internals.** No stack traces, no GraphQL error text, no schema internals, no policy internals. Denials return a stable reason code; details go to the ledger, not the wire.

---

## 14. Versioning and compatibility

### 14.1 The stale-client problem

Agents cache tool lists. When a manifest's `input_schema` changes, clients holding old definitions call with the previous shape. Without handling, this is silent breakage.

### 14.2 Rules

- `version` is SemVer and mandatory.
- **Breaking change** (removed/renamed field, narrowed type, new required field) ⇒ major bump ⇒ publish as a **new tool name** (`reprice_listing_v2`), mark the old `deprecated: true`, keep both live for a declared window.
- **Additive change** (new optional field, widened enum, clarified description) ⇒ minor bump, same name.
- `tools/list` includes `version` and a `deprecated` flag with a sunset date in the description.
- Every call records `tool_version` in the ledger, so post-hoc analysis can attribute behaviour to a specific declaration.

### 14.3 Pagination and discovery at scale

A rich instance accumulates tools; returning all of them bloats agent context and degrades selection. `tools/list` supports cursor pagination from v1. Phase 4 adds a discovery capability (search over tool names/descriptions) so agents can retrieve a relevant subset rather than the full set — the pattern proven by CLI-based MCP discovery approaches that cut MCP-related token usage dramatically.

---

## 15. Multi-tenancy

One module codebase, N governed endpoints. Installed per instance; each `/mcp` is scoped to that instance's data by pOS tenancy; the OAuth resource identifier is per instance; ledger, clients, and registry are per instance.

This is the quiet structural advantage: governance ships uniformly across every partner instance with no per-partner engineering. It is what makes this a platform capability rather than a bespoke integration, and it is the basis for the channel-partner story.

---

## 16. Hard problems and their treatment

### 16.1 Asynchronous work

Background jobs execute after the request completes. An agent calling a tool that enqueues work needs to know when it settled.

**Treatment:** such tools return a `job_handle` immediately with `status: accepted`. The module provides `mcp_job_status(job_handle)` returning `pending | done | failed` plus a result reference. The tool's `description` must state that it is asynchronous.

**Note a reusable primitive here.** "Has the async work settled?" is the same question a deterministic E2E test fixture asks (job queue drained, search index caught up, no pending callbacks). A shared quiescence endpoint would serve both the MCP job-status tool and test tooling. Worth scoping once rather than twice.

### 16.2 Streaming

MCP's streamable HTTP transport uses SSE for progress and server-initiated messages. Plain POST→JSON covers request/response tool calls, which is the bulk of the value, so **v1 does not implement SSE**. Long-running progress reporting and server-initiated notifications need it.

Holding SSE connections is not what pOS pages are built for. WebSockets broadcast exists; whether it composes into MCP's SSE expectation is an open investigation (§18), not a given. Do not commit to streaming timelines before that investigation concludes.

### 16.3 Idempotency

For `idempotent: true` tools, an optional client-supplied idempotency key is stored with the ledger entry; a repeat within the window returns the original result rather than re-executing. Agents retry more than humans do; without this, retries duplicate writes.

### 16.4 Regex safety

`pattern` in schemas is evaluated against agent-supplied input. Patterns are length-capped and reviewed; catastrophic-backtracking constructs are rejected at manifest load.

---

## 17. Configuration and performance

### 17.1 `config.yml` keys

```yaml
mcp:
  enabled: true
  protocol_version: "<pinned>"        # ⚠ VERIFY at implementation
  endpoint_path: /mcp
  oauth:
    issuer: <constant>
    jwks_uri: <constant>
    resource_identifier: <constant>
  dynamic_registration: false
  defaults:
    timeout_ms: 5000
    max_input_bytes: 65536
    max_schema_depth: 5
    rate_limit_per_min: 60
  resources:
    expose_markdown_pages: true
    markdown_page_prefixes: ["/docs", "/catalog"]
  ledger:
    retention_days: 730
```

### 17.2 Registry caching

Manifest parsing on every request is unacceptable. The registry is built once and cached, keyed by a deploy identifier so a deploy invalidates it. `⚠ VERIFY` the appropriate cache primitive and its invalidation semantics.

### 17.3 Budget

Target overhead of the governance pipeline (parse → validate → authorize → ledger) at **< 30 ms** p50 excluding handler time. Liquid profiling with 1 ms granularity is available and should be used to hold this line; if the pipeline is slow, agents batch around it and the design loses.

---

## 18. Open decisions

These must be closed before or during Phase 1. Two of them are load-bearing enough that changing them later is expensive.

1. **Raw request body access** (§9.1) — blocking. If unavailable, needs platform support.
2. **SHA-256 availability in Liquid** (§6.1) — blocking for the chained ledger as specified.
3. **Token format for delegation** (§9.4) — decided in principle (both modes, claims carry agent + principal); the concrete claim names must be fixed before any client integrates. **Highest retrofit cost on this list.**
4. **Transaction coverage** (§11.1) — confirm the tags cover every mutation path a handler may use.
5. **Runtime file enumeration for discovery** (§8.1) — determines whether explicit registration is the primary or the *only* mechanism. (Explicit registration is decided regardless; this only affects whether directory-scan can supplement it.)
6. **SSE / WebSockets composition** (§16.2) — investigation, not a commitment.
7. **MCP protocol revision to target** (§13.1) — pin explicitly.

---

## 19. Testing

### 19.1 Module test suite

- **Protocol conformance** — golden request/response fixtures per method, including every error mapping in §13.2.
- **Validation** — property-based cases per supported keyword; every unsupported keyword rejects at load.
- **Authorization** — matrix of (principal, tool, arguments) with expected allow/deny, including delegation cases.
- **Transaction** — deliberate handler failure at each step; assert no partial writes.
- **Ledger integrity** — append N entries, verify chain; attempt update/delete and assert policy denial; simulate tampering and assert `verify_chain` fails.
- **Rate limiting and size caps** — burst and oversize.

### 19.2 Adversarial suite

Non-negotiable, and reviewed like production code:

- Poisoned tool descriptions (instructions to the model embedded in a manifest) — asserts review lint fires.
- Injection payloads in every argument field — asserts no query-string interpolation reaches GraphQL.
- Agent-supplied URLs — asserts no egress.
- Token replay, expired token, wrong audience, agent token used without delegation claim.
- Deeply nested and oversized arguments.
- Concurrent conflicting mutations on the same subject.

### 19.3 Eval harness

Golden sets of realistic agent transcripts as Records; eval runs as background jobs; results queryable via GraphQL; CI gates on regression. This measures whether tool descriptions actually produce correct tool selection — a quality dimension unit tests cannot reach, and one that degrades silently as the tool set grows.

### 19.4 E2E

Playwright suite exercising the endpoint as a real MCP client against a seeded instance, including the approval workflow and the async job-handle path.

---

## 20. Observability

- Every call in the ledger (§6.1) — this is the primary audit and forensic surface.
- Metrics: calls/min by tool and client, denial rate by policy, rollback rate, p50/p95 latency split (pipeline vs handler), schema-rejection rate, approval queue depth and age.
- Alerts: denial-rate spike (probing), rollback-rate spike (broken tool or hostile agent), chain-verification failure (**page immediately**), approval queue age exceeding threshold.
- Admin UI: tool registry with versions and policies, ledger search, pending approvals, client management, chain verification status.

---

## 21. Build phases

**Phase 1 — governed read server.** `initialize`, `tools/list`, `tools/call` for non-mutating tools, `resources/list`/`read` over `.md` pages, `ping`. Identity binding, validation, authorization, and the full ledger from the start. Explicit registration. Admin ledger view.

> Rationale: this establishes the identity and attestation planes — the hard, load-bearing parts — and ships live value immediately, because the agentic-commerce pivot back to merchant-site transactions means most agents today *read* catalogues rather than write. Get the boring planes right first.

**Phase 2 — mutating tools.** Transaction wrapping, approval workflow, idempotency, rollback metrics, adversarial suite complete.

**Phase 3 — resource templates, prompts, logging, richer admin, eval harness in CI.**

**Phase 4 — streaming (subject to §18.6), async job handles hardened, dynamic tool discovery, transactional sessions, `*/list_changed` notifications.**

---

## 22. Success criteria

Phase 1 is done when an off-the-shelf MCP client, given only a bearer token and the endpoint URL, can list and call an app-declared read tool; every call — allowed and denied — appears in a verifiable ledger chain; and no configuration exists that exposes an unauthorized or unvalidated action.

The module as a whole succeeds if a partner shipping an agent surface on platformOS gets authorization, reversibility, and attestation **by default**, without writing any of the three — and if the resulting posture is defensible in a security review that a hand-rolled Node MCP server would fail.

---

## Appendix A — Example: `cancel_order`

```yaml
name: cancel_order
version: "1.0.0"
description: >
  Cancel an order belonging to the calling principal, if it has not shipped.
  Refunds are not issued by this tool; cancellation only sets order status and
  releases reserved inventory.
input_schema:
  type: object
  additionalProperties: false
  required: [order_id]
  properties:
    order_id: { type: string }
    reason:
      type: string
      enum: [changed_mind, wrong_item, delivery_too_slow, other]
      maxLength: 64
mutating: true
authorization_policy: order_owner_can_cancel
requires_approval: false
idempotent: true
audit_fields: [order_id, reason]
timeout_ms: 4000
handler: app/mcp/tools/cancel_order/call
```

Handler outline:

```liquid
{% liquid
  function order = 'app/lib/queries/orders/find', id: arguments.order_id
  if order == blank
    return { "ok": false, "error": { "code": 404, "message": "Order not found", "retryable": false } }
  endif
  if order.status != 'placed'
    return { "ok": false, "error": { "code": 409, "message": "Order is not cancellable", "retryable": false } }
  endif
  function res = 'app/lib/commands/orders/cancel', order: order, reason: arguments.reason
  return { "ok": true, "result": { "order_id": order.id, "status": "cancelled" }, "subject": { "type": "record", "id": order.id } }
%}
```

The handler contains no authorization logic — ownership was already enforced by `order_owner_can_cancel` before invocation. Business *state* checks (`status != placed`) remain the handler's job. Keeping that split clean is what makes the manifest a truthful summary of the tool's risk.

## Appendix B — Ledger entry example

```json
{
  "seq": 10241,
  "occurred_at": "2026-07-23T09:14:02Z",
  "method": "tools/call",
  "tool_name": "cancel_order",
  "tool_version": "1.0.0",
  "client_id": "acme-buyer-agent",
  "agent_id": "agent:acme-buyer-agent",
  "principal_id": "user:88213",
  "delegation_mode": "on_behalf_of",
  "input_sha256": "9f2c…",
  "input_bytes": 84,
  "authz_policy": "order_owner_can_cancel",
  "authz_decision": "allow",
  "execution_outcome": "success",
  "duration_ms": 61,
  "subject_type": "record",
  "subject_id": "order:55901",
  "prev_entry_hash": "b1d0…",
  "entry_hash": "7ae4…"
}
```

## Appendix C — Partner-facing summary (one paragraph)

Install `pos-module-mcp` and your instance becomes an MCP server that agents can call. Your documentation and catalogue pages are available to agents as clean Markdown immediately. Actions are not: you declare each one as a tool, with a typed input schema and a named authorization policy, reviewed like any other code. Every call an agent makes is authenticated to a real identity, checked against that policy, validated against that schema, wrapped so a failure rolls back cleanly, and recorded in a tamper-evident ledger you can query and export. You do not build any of that. You declare what agents may do; the platform enforces the rest.
