#!/usr/bin/env node
/**
 * pos-module-mcp — deterministic seed-migration GENERATOR (dev-time; TASK-5).
 *
 * Reads the single source of truth (tests/seed/seed.mjs) and emits the deploy-time
 * Liquid migration that seeds the fixed test fixtures. Run it ONCE and commit the
 * output; regenerate ONLY when the seed changes. Output is BYTE-IDENTICAL across runs
 * (fixed migration timestamp + stable key order), so `git diff` stays empty unless the
 * seed actually changed.
 *
 *   node tests/seed/generate_migrations.mjs
 *
 * The emitted migration is GATED on the instance constant MCP_SEED_TEST_FIXTURES: a
 * plain test-app deploy (constant unset) runs it as a no-op — NO test users are seeded.
 * CI sets MCP_SEED_TEST_FIXTURES=1 for the live test stage. The migration lives in the
 * TEST APP only (app/migrations/); the published module ships zero migrations.
 *
 * Safety: the fixture data is embedded as JSON inside a single-quoted Liquid string
 * parsed via `parse_json`. We ASSERT the JSON contains no `'`, `{{`, or `{%` sequence
 * (which would corrupt the Liquid template) and fail loudly if the seed ever introduces
 * one — the same footgun class documented across this module.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { userImports, modelImports } from './seed.mjs';

// FIXED timestamp → regeneration overwrites the SAME file (deterministic; no churn).
const MIGRATION_TS = '20260727120000';
const MIGRATION_NAME = `${MIGRATION_TS}_seed_mcp_test_fixtures.liquid`;

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, '../../app/migrations', MIGRATION_NAME);

// Stable, compact JSON (insertion order is deterministic from seed.mjs).
const usersJson = JSON.stringify(userImports());
const modelsJson = JSON.stringify(modelImports());

for (const [label, json] of [['users', usersJson], ['models', modelsJson]]) {
  for (const bad of ["'", '{{', '{%']) {
    if (json.includes(bad)) {
      console.error(`FATAL: ${label} JSON contains a Liquid-breaking sequence ${JSON.stringify(bad)} — fix the seed.`);
      process.exit(1);
    }
  }
}

const migration = `{% comment %}
  pos-module-mcp — deterministic TEST fixtures (TASK-5). GENERATED FILE — do not edit by
  hand; edit tests/seed/seed.mjs and re-run tests/seed/generate_migrations.mjs.

  GATED: seeds ONLY when the instance constant MCP_SEED_TEST_FIXTURES is '1'/'true'
  (CI sets it for the live test stage). A plain deploy leaves it unset → this is a no-op,
  so no test users/tokens/access ever land on a normal instance. import_users /
  import_models use _id_remap:false so the fixed ids are preserved on every run; re-running
  UPSERTS (resets mutated fixture properties back to baseline).
{% endcomment %}
{% liquid
  assign gate = context.constants.MCP_SEED_TEST_FIXTURES | default: ''
  assign on = false
  if gate == '1' or gate == 'true'
    assign on = true
  endif
%}
{% if on %}
{% liquid
  assign users = '${usersJson}' | parse_json
  assign models = '${modelsJson}' | parse_json
%}
{% graphql _seed_users, users: users %}
  mutation($users: [UserImport!]!) {
    import_users(_id_remap: false, _index_rebuild: false, users: $users) { ids }
  }
{% endgraphql %}
{% graphql _seed_models, models: models %}
  mutation($models: [CustomizationImport!]!) {
    import_models(_id_remap: false, _index_rebuild: false, models: $models) { ids }
  }
{% endgraphql %}
{% log 'migrations/seed_mcp_test_fixtures: seeded (MCP_SEED_TEST_FIXTURES on)' %}
{% else %}
{% log 'migrations/seed_mcp_test_fixtures: skipped (MCP_SEED_TEST_FIXTURES not set)' %}
{% endif %}
`;

writeFileSync(outPath, migration);
console.log(`wrote ${MIGRATION_NAME} (${migration.length} bytes)`);
console.log(`  users: ${userImports().length}  models: ${modelImports().length}`);
