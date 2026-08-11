# Changelog

## 0.2.1

**Requires `core ^2.1.9`** (previously `^1.5.0`). This release migrates the module to core 2.x
Liquid idioms and will not run on core 1.x.

- Migrated to native Liquid data structures throughout: `'[]' | parse_json` → `[]`,
  `'{ ... }' | parse_json` → `{ ... }`, `| array_add: x` → `<< x`, and
  `| hash_merge: field: value` → direct `assign object.field = value`.
- Replaced `hash_assign result['key'] = ...` with `assign result.key = ...` in
  `data_exports/create/build` and `data_exports/delete/build`.
- Fixed a malformed argument list in `modules/data_export_api/commands/data_exports/create`:
  the call to `modules/core/commands/execute` was missing the comma after `mutation_name`.
  The call now also passes `selection: 'record'` explicitly.
- `modules/core/queries/variable/find` in `lib/shared/authorize` now passes an explicit
  `default: ''` for both `_data_export_api_key` and `_data_export_whitelisted_ips`.
- `modules/core/validations/presence` now receives an explicit
  `key: 'modules/core/validation.blank'`.
- Removed the legacy `hook_module_info` hook, which is no longer part of the module contract.
- Added `platformos-check` disable/enable pragmas around the `authorize` include in the API
  pages.
- **Migration:** upgrade `core` to `^2.1.9` before upgrading this module. The HTTP API is
  unchanged — routes, methods, request parameters and response bodies are identical to 0.1.1.

## 0.1.1 and earlier

Released before this changelog was kept; see the git history for details.
