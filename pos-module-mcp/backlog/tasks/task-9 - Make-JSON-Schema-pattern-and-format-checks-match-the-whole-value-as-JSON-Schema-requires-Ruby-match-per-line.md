---
id: TASK-9
title: >-
  Make JSON Schema pattern and format checks match the whole value, as JSON
  Schema requires (Ruby ^/$ match per line)
status: To Do
assignee: []
created_date: '2026-10-15 17:18'
labels:
  - pos-module-mcp
  - validation
  - security
dependencies: []
references:
  - modules/mcp/public/lib/commands/validate/json_schema.liquid
  - modules/mcp/public/lib/commands/registry/build_prompts.liquid
  - modules/mcp/public/lib/commands/registry/manifest_schema.liquid
  - modules/mcp/public/lib/queries/resources/provided_uri.liquid
  - modules/mcp/public/lib/commands/eval/run.liquid
priority: high
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Problem.** platformOS `matches` uses Ruby regular expressions. In Ruby, `^` and `$` match at the start and end of every line, not of the whole value. JSON Schema `pattern` follows ECMA-262, where `^` and `$` (without the `m` flag) anchor the whole string. So the module accepts values that the schemas it serves say must be refused.

Shown on memo on 2026-10-15: `commands/validate/json_schema` with `{"type":"string","pattern":"^[A-Za-z0-9:/._-]+$"}` returned `valid: true` for `"deploy.window\ninjected text"`, and `valid: false` for `"bad key!"`.

**Where (module source, `modules/mcp/public/lib/`):**
- `commands/validate/json_schema.liquid:127`: `value | matches: schema.pattern`. This is the main issue. Every app tool argument with a `pattern` is affected: ids, keys and dates in practice.
- `commands/validate/json_schema.liquid:136-142`: the `format` regexes for uuid, email, date-time and date use `^…$`. For example, `2026-01-01` + line break + junk passes `format: date`, and then the calendar check reads day `01`.
- `commands/registry/build_prompts.liquid:51`: prompt names are checked against `^[a-z][a-z0-9_]{2,63}$`. App prompt providers can build names from stored data; MEMO : VAULT does so from workflow command names.
- `commands/registry/manifest_schema.liquid:42` (tool names, `^…$`) and `:52` (version, `^` prefix). These come from code, so they're low risk, but they should be consistent.
- `queries/resources/provided_uri.liquid:13`: the scheme check `^[A-Za-z][A-Za-z0-9+.-]*:` matches a scheme at the start of any line.
- `commands/eval/run.liquid:223`: the eval warning tells app developers to add `"pattern":"^[^<>]*$"` to reject HTML and script payloads. Under Ruby matching, `safe` + line break + `<script>…</script>` passes that pattern, so the recommended defence can be bypassed.

**Change.**
1. **Schema patterns.** Evaluate `pattern` with whole-value semantics, as JSON Schema requires. Recommended: match against the whole value, `value | matches: pattern_for_whole_value`, where the module rewrites the schema's unescaped `^` and `$` outside character classes to `\A` and `\z`, or wraps the pattern as `\A(?:…)\z` when the schema author meant a full match.
   - Careful: JSON Schema patterns are not implicitly anchored. `abc` must still match `xabcx`. So only the explicit anchors may change meaning; do not wrap unanchored patterns.
   - Document the chosen translation, and test both an anchored and an unanchored pattern.
2. **Module patterns.** Change the module's own literals to `\A…\z`, keeping prefix checks as `\A…` without `\z`. Fix the eval advice to `^[^<>]*$` validated with whole-value semantics, or say how it is evaluated.
3. **Existing apps.** Keep the existing schemas valid for MCP clients: manifests must keep ECMA syntax (`^…$`), because `\A` and `\z` are not ECMA-262. The fix belongs in the validator, not in app manifests.

**Outcome.** A value with a line break cannot pass a `pattern` or `format` check the schema would refuse, and the module's own name and URI checks match whole values.

**Found by.** MEMO : VAULT (pos-memory) MV-57, 2026-10-15. MEMO : VAULT now refuses these values in its own commands, so this is defence in depth there. Other apps that rely on the module's schema check have no second check.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A tools/call whose string argument has a pattern anchored with ^ and $ is refused with -32602 when the value contains a line break followed by text the pattern would refuse; the same value without the line break part is accepted (conformance test)
- [ ] #2 An unanchored pattern still matches a substring (pattern abc accepts xabcx), so the translation changes only explicit anchors (test)
- [ ] #3 format date, date-time, uuid and email refuse a valid value followed by a line break and more text (test)
- [ ] #4 build_prompts refuses a provider prompt whose name contains a line break, and manifest tool names are checked the same way (test)
- [ ] #5 The eval warning's suggested pattern rejects safe + line break + <script> under the module's validator (test)
- [ ] #6 Each new test fails with the current ^/$ handling (planted-bug check, then restored)
- [ ] #7 README and CHANGELOG state how pattern is evaluated
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Automated tests written and passing (protocol conformance / validation / authz / ledger integrity as applicable)
- [ ] #2 platformos-check lint passes with zero errors
- [ ] #3 Docs updated (module docs/ + spec section cross-reference)
- [ ] #4 Deployed to the community test instance (staging) and smoke-checked over real /mcp HTTP
- [ ] #5 Security invariants verified — no-implicit-allow · identity-bound · args passed as typed variables (never string-interpolated) · ledger written on every post-auth termination
- [ ] #6 Change reviewed before merge
<!-- DOD:END -->
