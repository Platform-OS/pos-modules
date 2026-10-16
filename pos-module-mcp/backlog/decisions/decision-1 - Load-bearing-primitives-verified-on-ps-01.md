---
id: DEC-1
title: Load-bearing platformOS primitives verified on ps-01 (spec §18 gate)
date: '2026-07-23'
status: accepted
---

## Context

`pos-module-mcp-spec.md` §18 lists load-bearing `⚠ VERIFY` items that must be
resolved before Phase 1 estimation, because a failure means redesign, not a
workaround. Verified empirically against the community test instance
`staging` = `https://fk-test-ci-instance-04.ps-01-platformos.com/` (ps-01,
ps-type backend) via `liquid-exec` on 2026-07-23.

## Findings (verified)

- **SHA-256 for the ledger hash chain (§6.1, §18.2 — BLOCKING): RESOLVED.**
  The Liquid filter is `| digest: 'sha256'` — NOT `| sha256` (undefined) and
  NOT `| hmac_sha256` (undefined). Verified: `'hello' | digest: 'sha256'` →
  `2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824` (correct).
  `| sha1` also exists; `| md5` does not. → The chain can use a true SHA-256 as
  specified; the HMAC-with-instance-secret fallback (weaker threat model) is
  NOT needed. **Handlers/ledger MUST call `digest: 'sha256'`.**

- **transaction / rollback (§11.1, §18.4 — BLOCKING): RESOLVED.**
  `{% transaction %} … {% rollback %} … {% endtransaction %}` tags exist and
  work: buffered output and DB mutations inside the block are discarded on
  `rollback`, and execution CONTINUES after `endtransaction` (probe emitted
  `before=` then `after-tx`, with in-block output discarded). Attestation-
  inside-the-transaction (§4.3) is achievable. NOTE: `liquid-exec` surfaces the
  rollback as a top-level `ActiveRecord::Rollback`; that is a harness artifact
  of the exec endpoint — inside a rendered page the block completes normally.
  Confirm page-context behaviour in the Phase-1 spike (task-1.1).

- **JWT (§9.4, §18.3 — token format): FEASIBLE.**
  `jwt_encode` (and by extension `jwt_decode`) filters are live. `jwt_encode`
  requires a hash as its first argument (it rejected a JSON string), confirming
  the filter exists and is typed. Delegation-token verification (direct +
  on_behalf_of, carrying `sub` principal + `azp`/`act` agent) is implementable.
  Exact decode/verify signature (algorithm, issuer/JWKS, expiry) to be pinned
  in task-1.3.

- **Header auth read: RESOLVED.** `context.headers.HTTP_AUTHORIZATION` reads the
  raw `Authorization` header (returned the caller's `Token …`). Bearer
  extraction is trivial.

## Still open (moved to task-1.1 spike — needs a DEPLOYED page, not liquid-exec)

- **Raw JSON-RPC request body (§9.1, §18.1 — BLOCKING).** `liquid-exec` has no
  POST body (`context.post` was empty). Must confirm on a real `POST /mcp`
  page whether the raw JSON body is accessible (or only `context.post`
  form-decoded). Prior art: the earlier community-solution-mcp used a
  `format: json` page and successfully parsed JSON-RPC — strong signal it
  works, but confirm the RAW-bytes path for `input_sha256`/`input_bytes`; if
  only a parsed hash is available, canonicalize-then-hash the parsed object.
- **Runtime module→app file enumeration for discovery (§8.1, §18.5).** Likely
  unavailable → explicit registration in `pos-module.json` becomes the ONLY
  mechanism (which the spec already decided is the safe default, §8.2). Confirm.
- **MCP protocol revision to pin (§13.1, §18.7).** External fact — pin the
  target revision explicitly in `initialize` (task-1.2 / task-1.8).

## Update 2026-07-23 — remaining items closed (build instance = pos-module-mcp.ps-01)

Build instance is now `https://pos-module-mcp.ps-01-platformos.com/` (`.pos` env
`ps`, community already deployed). Re-confirmed `digest:'sha256'` there.

- **Raw JSON-RPC body (§9.1, §18.1 — BLOCKING): RESOLVED via `context.params`.**
  A `slug: mcp / method: post / format: json` page exposes the parsed JSON body
  on `context.params` — including nested objects (`context.params.method`,
  `context.params.id`, `context.params.params.name`,
  `context.params.params.arguments`). Proven by the prior community-MCP endpoint
  which drove real MCP clients. No raw-byte access needed; `input_sha256` /
  `input_bytes` are computed over the CANONICAL JSON of the parsed arguments
  (documented fallback). `echo <hash>` in a json-format page emits unescaped
  JSON (the response-serialization mechanism).

- **HTTP status + headers (§13.2, §9.5): RESOLVED.** `{% response_status 400 %}`
  sets the code; `{% response_headers '{"WWW-Authenticate":"…"}' %}` sets headers
  (JSON-string arg). So the full §13.2 status table and the 401 WWW-Authenticate
  are implementable.

- **JWT verification (§9.4): RESOLVED — full.** `token | jwt_decode: ALG, SECRET`
  returns `[payload, header]`; supports HS256/384/512 AND RS256/384/512 with a
  PEM public key or a `jwks` hash, plus a `verify_signature` flag. OAuth
  resource-server bearer validation against an issuer/JWKS is feasible.

- **Runtime module→app file enumeration (§8.1, §18.5): CONFIRMED UNAVAILABLE.**
  Liquid has no runtime filesystem access. → explicit registration in the app
  manifest is the ONLY discovery mechanism (exactly the spec's decided default,
  §8.2). Directory-scan supplement is off the table; not a loss.

- **MCP protocol revision (§13.1, §18.7): PINNED `2025-06-18`.** (Latest stable;
  it also removed JSON-RPC batching, so the transport handles single objects
  only — no batch array — which simplifies §13.)

- **transaction/rollback in PAGE context (§11.1): CONFIRMED (2026-07-23, Phase-2 gate).**
  A throwaway `/mcp-txtest` json page did `transaction → record_create → rollback →
  endtransaction` then re-queried: HTTP 200 (NO 500), execution continued past
  `endtransaction` (both a pre- and post-marker were reached), and the row created
  in the transaction did NOT persist (`persisted_after_rollback: 0`). So the
  liquid-exec top-level `ActiveRecord::Rollback` was purely a harness artifact; in a
  rendered page the block completes and control continues. Attest-inside-transaction
  (§4.3) with rollback-on-failure is buildable. Spike page removed after verifying.

## Update 2026-07-23 (2) — transport built + live-verified; one platform deviation

Transport (task-1.2) deployed to `ps` and verified over real HTTP. All reachable
§13.2 rows confirmed live: initialize→200, ping→200, unknown method→-32601/400,
missing method→-32600/400, bad jsonrpc→-32600/400, notification→empty/202,
oversize(>64KB)→-32600/413.

- **DEVIATION — malformed JSON body (§13.2 row 1).** platformOS parses request
  params BEFORE the page executes and, on invalid JSON with
  `Content-Type: application/json`, returns its OWN `HTTP 415` ("Error occurred
  while parsing request parameters") — the page never runs, so the spec's
  `-32700 / 400` JSON-RPC body is NOT emittable. No raw-body hook exists to
  intercept pre-parse. ACCEPTED as a platform limitation: conformant MCP clients
  always send valid JSON; the client still receives a 4xx. Documented; not worked
  around. (If strict -32700 ever becomes required, it needs platform support.)
- **`echo <hash>`** on a `format:json` page emits raw unescaped JSON — the
  response serializer. `| json` output through `{{ }}` is HTML-escaped (do NOT
  use it for the body). `hash_merge` is the (shallow) merge filter; `deep_merge`
  does NOT exist.

## Consequence

Phase 1 is buildable as specified. Every §18 blocking item is resolved; only the
page-context transaction confirmation remains (Phase-2 relevant). No section
needs redesign. The task-1.1 spike is satisfied WITHOUT a throwaway probe page —
resolved via prior art + doc verification + the live digest check.
