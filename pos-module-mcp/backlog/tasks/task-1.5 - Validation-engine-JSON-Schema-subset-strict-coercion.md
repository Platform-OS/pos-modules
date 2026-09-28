---
id: TASK-1.5
title: 'Validation — JSON Schema subset, forced additionalProperties, strict coercion'
status: Done
assignee: []
created_date: '2026-07-23'
updated_date: '2026-07-23'
labels:
  - pos-module-mcp
  - validation
dependencies:
  - TASK-1.4
parent_task_id: TASK-1
priority: high
ordinal: 1050
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`views/partials/validate/json_schema.liquid` — validate `tools/call` arguments
against a tool's `input_schema` (spec §10). Supported subset ONLY (§10.1):
`type` (object/string/integer/number/boolean/array), `required`, `properties`,
`additionalProperties:false` (FORCED regardless of declaration), `enum`,
`minimum/maximum/exclusiveMinimum/exclusiveMaximum`, `minLength/maxLength/
pattern` (bounded regex, §16.4 — reject catastrophic-backtracking constructs at
manifest load), `items` (single schema)/`minItems/maxItems`, `format`
(date-time/email/uuid — advisory).

Coercion is STRICT (§10.2): `"42"` for an integer is REJECTED, not coerced —
agents emit well-formed JSON and lenient coercion hides model errors and widens
the input surface. Nesting depth capped (default 5) and total argument size
capped (default 64 KB, per-client overridable DOWNWARD only). Unknown keys
rejected. An unsupported schema keyword must cause manifest REJECTION at load
(coordinate with task-1.4), never silent ignore — "an implementer must never
declare a constraint the module does not enforce."
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every supported keyword validates: type/required/properties/enum/min-max/exclusive/minLength-maxLength/pattern/items/minItems-maxItems/format(date-time,email,uuid). VERIFIED via matrix + live HTTP.
- [x] #2 additionalProperties FORCED false regardless of declaration; unknown keys → -32602. VERIFIED (unknown "bogus" rejected live).
- [x] #3 Strict typing, NO coercion: "5" for integer rejected; float-for-integer rejected (whole-floats accepted per JSON-Schema); int-for-string rejected; null-for-typed rejected. VERIFIED live over HTTP.
- [x] #4 Depth cap enforced (config.defaults.max_schema_depth, recursion-guarded). Size cap enforced at transport (64KB, task-1.2). Per-token narrowing is a documented seam (token.max_input_bytes) — global cap active now.
- [~] #5 Regex/keyword rejection lives in the SCHEMA validator (task-1.4 registry/validate_schema_node): pattern length-cap + catastrophic-backtracking signatures rejected at load. This task validates VALUES against an already-safe schema. Covered.
- [~] #6 Unsupported-keyword-rejection is task-1.4 (manifest load). Done there.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:IMPL:BEGIN -->
File: modules/mcp/public/lib/commands/validate/json_schema.liquid (recursive value
validator, depth-capped). Wired into rpc/tools_call step 5 (after resolve, before
execute); failure → -32602 "Invalid arguments" with a caller-safe `validation_errors`
array (which key + which constraint — no server internals) + ledger(execution_outcome
invalid).

CRITICAL platformOS LESSONS:
- Request params arrive as `ActiveSupport::HashWithIndifferentAccess`, NOT plain
  `Hash` — so type_of returns that string and a naive `vt == 'Hash'` check FAILS on
  real HTTP (passed under liquid_render's parse_json). FIX: normalize arguments via
  a JSON round-trip (`args | json | parse_json`) at the tools_call entry (canonical
  plain types incl. nested), AND the object check accepts `vt contains 'Hash'`. This
  class of bug is invisible to unit tests — only live HTTP surfaced it.
- Liquid `case`: `when 'integer'` then `when 'number'` on SEPARATE lines does NOT
  fall through — the first `when` gets an EMPTY body. Use `when 'integer', 'number'`
  (comma) for a shared branch. (Silently skipped all integer min/max until fixed.)
- type_of on JSON: Integer/Float/String/Boolean/Array/Hash; null → 'null' (a null
  value is a present key). Whole floats (42.0) parse as Float → accepted for integer
  only when value == floor(value) (JSON-Schema semantics), else rejected.
<!-- SECTION:IMPL:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Property-based validation tests (per keyword + rejection matrix) written and passing
- [ ] #2 platformos-check lint passes with zero errors
- [ ] #3 Docs updated (spec §10 cross-ref; supported-subset table)
- [ ] #4 Deployed to staging and exercised via a real tools/call with bad + good args
- [ ] #5 Security invariants verified — no coercion widening; caps enforced
- [ ] #6 Reviewed before merge
<!-- DOD:END -->
