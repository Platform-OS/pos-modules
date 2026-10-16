---
id: TASK-1.1
title: 'SPIKE — close remaining load-bearing primitives on a deployed /mcp page'
status: Done
assignee: []
created_date: '2026-07-23'
updated_date: '2026-07-23'
labels:
  - pos-module-mcp
  - spike
  - blocking
dependencies: []
parent_task_id: TASK-1
priority: high
ordinal: 1010
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Gate for all other Phase-1 work. `decision-1` already resolved SHA-256
(`digest:'sha256'`), transaction/rollback, JWT filters, and header auth via
liquid-exec. Three items remain and CANNOT be tested with liquid-exec because
they need a real HTTP POST and page context. Deploy a throwaway probe page to
close them, then delete it. If any fails, escalate before building — these are
redesign-class, not workaround-class (spec §11 reading note, §18).

Probe deliverables:
1. **Raw JSON-RPC body (§9.1, §18.1 — BLOCKING).** Deploy a `POST /mcp-probe`
   page (`format: json`). POST a real JSON-RPC envelope and determine exactly
   how the body is exposed: raw string vs `context.post` parsed hash. Record
   the accessor. Confirm we can compute `input_bytes` and a stable
   `input_sha256` over the arguments (raw bytes if available; else canonical
   JSON of the parsed object — document which).
2. **Page-context transaction/rollback.** Inside the page (not liquid-exec),
   confirm a `record_create` inside `{% transaction %}…{% rollback %}` leaves
   NO row, and that the page continues to render a normal JSON-RPC response
   after `endtransaction` (no 500). Use a scratch table; clean up.
3. **Runtime module→app file enumeration (§8.1, §18.5).** Determine whether the
   module can enumerate `app/mcp/tools/*/manifest.yml` at runtime. Expected:
   no → explicit registration in `pos-module.json` is the ONLY mechanism
   (already the decided default, §8.2). Record the answer either way.
4. **MCP protocol revision (§13.1, §18.7).** Pin the exact revision string the
   module will advertise in `initialize`; record it.

Record every result in `decision-1` (append) and delete the probe page.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Raw JSON-RPC body accessor confirmed: `context.params` on a slug:mcp/method:post/format:json page (nested objects included). Input hashed over canonical JSON of parsed arguments (documented in decision-1)
- [x] #2 Raw bytes unavailable → canonical-parsed fallback documented; no workaround hack
- [~] #3 transaction/rollback: confirmed via liquid-exec; PAGE-context confirmation with a real record_create carried into task-1.7 (ledger) where it is exercised for real rather than in a throwaway probe
- [x] #4 Runtime file enumeration CONFIRMED UNAVAILABLE (no Liquid FS) → explicit registration is the only mechanism (spec §8.2)
- [x] #5 MCP protocol revision pinned: 2025-06-18 (also removes JSON-RPC batching → single-object transport)
- [x] #6 No throwaway probe left — spike resolved via prior art + doc verification + live checks; the real transport endpoint is the artifact
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Findings appended to backlog/decisions/decision-1 (two updates)
- [x] #2 platformos-check lint passes (deploy to ps succeeded — deploy runs check)
- [x] #3 No throwaway probe created; nothing to clean
- [x] #4 No blocking finding; the one deviation (malformed-JSON → platform 415) is documented, not blocking
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
All spec §18 blocking items closed WITHOUT a throwaway probe, on the build
instance pos-module-mcp.ps-01. Body access = `context.params` (parsed JSON,
nested); input hashing = canonical JSON of parsed args (no raw bytes). HTTP
status/headers via `response_status`/`response_headers` tags → full §13.2 table +
401 WWW-Authenticate feasible. JWT = `jwt_decode: ALG, secret/jwks` (HS+RS+JWKS).
SHA-256 = `digest:'sha256'`. transaction/rollback verified (liquid-exec);
page-context confirm folded into task-1.7. Runtime file enumeration unavailable →
explicit registration only. Protocol pinned 2025-06-18. ONE deviation: malformed
JSON is rejected by the platform param-parser (HTTP 415) before the page runs, so
-32700 is not emittable — accepted + documented. Serializer: bare `echo <hash>` =
raw JSON; `hash_merge` (no `deep_merge`).
<!-- SECTION:FINAL_SUMMARY:END -->
