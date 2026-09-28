/**
 * pos-module-mcp — deterministic test-fixture SEED (single source of truth). [TASK-5]
 *
 * Replaces the old runtime-randomized fixtures (fixtures.mjs `user_create` +
 * `randomBytes` tokens, per-run unique emails, the shared-4-user matrix + `revive`
 * hack) with FIXED, id-stable fixtures in a reserved id range (90000+), one dedicated
 * user-set per stateful concern so no suite ever inherits another's abuse/suspend state.
 *
 * Proven mechanism (see TASK-5 notes): platformOS `import_users` / `import_models` with
 * `_id_remap:false` preserve the explicit numeric `id` on every run (repeatable even on a
 * fresh instance); `UserImport.password` is plaintext (login works, no bcrypt); records
 * store their fields under `properties`; RE-IMPORT upserts — it resets any mutated
 * property back to baseline (the reset primitive for repeatable local re-runs).
 *
 * This module is the SINGLE SOURCE consumed by BOTH:
 *   • tests/seed/generate_migrations.mjs → emits the deploy-time Liquid migration
 *     (app/migrations/…_seed_mcp_test_fixtures.liquid, gated on MCP_SEED_TEST_FIXTURES)
 *   • the test harnesses → import the exported handles + call applyReset() to re-baseline
 *     at start of run (no runtime user_create, no randomBytes, no revive).
 *
 * KNOWN raw tokens are committed on purpose — these are throwaway TEST fixtures on a
 * throwaway TEST instance; the whole point is reproducibility, not secrecy.
 */
import { createHash } from 'node:crypto';

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// ── reserved id ranges (never collide with real data) ───────────────────────────────
// NOTE: a platformOS DELETE reserves the id (import_models cannot recreate a deleted
// fixed id). Fixtures are therefore NEVER deleted — only their properties are reset via
// re-import upsert (see applyReset), and cleanup skips seeded ids (seededRecordIds()).
const U = 90100;   // users         90101..  (never deleted)
const T = 91000;   // tokens        91001..  (bumped: old range poisoned by deletes)
const A = 91100;   // access rows   91101..  (bumped: old range poisoned by deletes)
const E = 90400;   // domain (events) 90401.. (never deleted → stable, upserts)

const PW = 'McpFixture!2026';         // one fixed login password for every fixture user
const CONF_KEYWORD = 'confjazzfixture'; // conformance search keyword → matches ONLY the seeded event

/**
 * The fixture users. Each may carry an mcp_access row and one or more mcp_token rows.
 * `raw` is the KNOWN bearer string; the seeded token stores only sha256(raw).
 * `role`: dedicated per stateful concern to eliminate cross-suite contamination.
 */
const USERS = [
  { key: 'operator',  id: U + 1, email: 'mcp-fixt-operator@test.local',  slug: 'mcp-fixt-operator',
    name: 'MCP Fixture Operator', access: { role: 'admin', status: 'active' },
    tokens: [{ id: T + 1, raw: 'mcp_fixt_operator_v1', label: 'fixt-operator', status: 'active' }] },

  { key: 'member',    id: U + 2, email: 'mcp-fixt-member@test.local',    slug: 'mcp-fixt-member',
    name: 'MCP Fixture Member', access: { role: 'user', status: 'active' },
    tokens: [
      { id: T + 2,  raw: 'mcp_fixt_member_v1',        label: 'fixt-member',  status: 'active' },
      // pre-seeded extra tokens for the token-lifecycle tests (no runtime mint / randomBytes):
      { id: T + 12, raw: 'mcp_fixt_member_narrow_v1', label: 'fixt-narrow',  status: 'active', allowed_tools: ['test_public'] },
      { id: T + 13, raw: 'mcp_fixt_member_revoke_v1', label: 'fixt-revoke',  status: 'active' },
    ] },

  { key: 'outsider',  id: U + 3, email: 'mcp-fixt-outsider@test.local',  slug: 'mcp-fixt-outsider',
    name: 'MCP Fixture Outsider', access: null, // authenticated but UNAUTHORIZED (no access row)
    tokens: [{ id: T + 3, raw: 'mcp_fixt_outsider_v1', label: 'fixt-outsider', status: 'active' }] },

  { key: 'requester', id: U + 4, email: 'mcp-fixt-requester@test.local', slug: 'mcp-fixt-requester',
    name: 'MCP Fixture Requester', access: { role: 'user', status: 'requested' }, // request-access flow; cannot mint yet
    tokens: [] },

  // Dedicated users for the stateful planes (each gets suspended/limited in isolation,
  // so no shared fixture ever needs `revive`):
  { key: 'rate',   id: U + 5, email: 'mcp-fixt-rate@test.local',   slug: 'mcp-fixt-rate',
    name: 'MCP Fixture Rate', access: { role: 'user', status: 'active' },
    tokens: [{ id: T + 5, raw: 'mcp_fixt_rate_v1', label: 'fixt-rate', status: 'active' }] },

  { key: 'abuseA', id: U + 6, email: 'mcp-fixt-abusea@test.local', slug: 'mcp-fixt-abusea',
    name: 'MCP Fixture AbuseA', access: { role: 'user', status: 'active' },
    tokens: [{ id: T + 6, raw: 'mcp_fixt_abusea_v1', label: 'fixt-abusea', status: 'active' }] },

  { key: 'abuseB', id: U + 7, email: 'mcp-fixt-abuseb@test.local', slug: 'mcp-fixt-abuseb',
    name: 'MCP Fixture AbuseB', access: { role: 'user', status: 'active' },
    tokens: [{ id: T + 7, raw: 'mcp_fixt_abuseb_v1', label: 'fixt-abuseb', status: 'active' }] },

  { key: 'abuseC', id: U + 8, email: 'mcp-fixt-abusec@test.local', slug: 'mcp-fixt-abusec',
    name: 'MCP Fixture AbuseC', access: { role: 'user', status: 'active' },
    tokens: [{ id: T + 8, raw: 'mcp_fixt_abusec_v1', label: 'fixt-abusec', status: 'active' }] },

  { key: 'validator', id: U + 9, email: 'mcp-fixt-validator@test.local', slug: 'mcp-fixt-validator',
    name: 'MCP Fixture Validator', access: { role: 'user', status: 'active' },
    tokens: [{ id: T + 9, raw: 'mcp_fixt_validator_v1', label: 'fixt-validator', status: 'active' }] },

  // Isolated conformance principal (protocol/adversarial suite).
  { key: 'conformance', id: U + 90, email: 'mcp-fixt-conformance@test.local', slug: 'mcp-fixt-conformance',
    name: 'MCP Fixture Conformance', access: null,
    tokens: [{ id: T + 90, raw: 'mcp_fixt_conformance_v1', label: 'fixt-conformance', status: 'active' }] },
];

// A single published community event with a unique keyword — conformance's search_events
// assertion matches exactly this one row (deterministic count===1).
const EVENTS = [
  { id: E + 1, table: 'modules/community/event', properties: {
      name: 'Conformance Jazz (fixture)', short_description: CONF_KEYWORD,
      description: 'a ' + CONF_KEYWORD + ' show', start_date: '2026-09-01T19:00:00Z',
      end_date: '2026-09-01T22:00:00Z', status: 'published' } },
];

const T_TOKEN = 'modules/mcp/mcp_token';
const T_ACCESS = 'modules/mcp/mcp_access';

/** import_users payload (UserImport[]). Fixed id + plaintext password. */
export function userImports() {
  return USERS.map((u) => ({ id: String(u.id), email: u.email, slug: u.slug, name: u.name, password: PW }));
}

/**
 * import_models payload (CustomizationImport[]) — every token + access + domain row.
 * All identity-bearing fields live in `properties` (that is where the engine reads them).
 */
export function modelImports() {
  const models = [];
  for (const u of USERS) {
    if (u.access) {
      models.push({ id: String(A + (u.id - U)), type_name: T_ACCESS, user_id: String(u.id), properties: {
        user_id: String(u.id), email: u.email, role: u.access.role, status: u.access.status, decided_by: 'seed' } });
    }
    for (const t of (u.tokens || [])) {
      const props = { user_id: String(u.id), token_digest: sha256(t.raw), label: t.label, status: t.status };
      if (t.allowed_tools) props.allowed_tools = t.allowed_tools;
      models.push({ id: String(t.id), type_name: T_TOKEN, user_id: String(u.id), properties: props });
    }
  }
  for (const ev of EVENTS) {
    models.push({ id: String(ev.id), type_name: ev.table, properties: ev.properties });
  }
  return models;
}

/**
 * The set of all seeded record ids (tokens + access + domain), as strings. Cleanup in the
 * suites must SKIP these (a deleted fixed id can never be re-imported) — only web-flow-created
 * EXTRA rows (auto-generated ids) may be deleted.
 */
export function seededRecordIds() {
  const ids = new Set();
  for (const m of modelImports()) ids.add(String(m.id));
  return ids;
}

/** Exported handles the suites consume: fixed ids, emails, passwords, KNOWN raw tokens. */
export const FIXT = {
  password: PW,
  confKeyword: CONF_KEYWORD,
  users: Object.fromEntries(USERS.map((u) => [u.key, {
    key: u.key, userId: String(u.id), email: u.email, slug: u.slug, password: PW,
    principal: 'user:' + u.id, role: u.access?.role || null, status: u.access?.status || null,
    // primary token first; extras addressable by label
    rawToken: u.tokens?.[0]?.raw || null, tokenId: u.tokens?.[0]?.id ? String(u.tokens[0].id) : null,
    tokens: (u.tokens || []).map((t) => ({ id: String(t.id), raw: t.raw, label: t.label, status: t.status, allowed_tools: t.allowed_tools || null })),
    accessId: u.access ? String(A + (u.id - U)) : null,
  }])),
  event: { id: String(EVENTS[0].id), keyword: CONF_KEYWORD },
};

/** The raw GraphQL mutation strings (shared by the runtime reset). */
export const IMPORT_USERS_MUTATION =
  'mutation($users:[UserImport!]!){ import_users(_id_remap:false,_index_rebuild:false, users:$users){ ids } }';
export const IMPORT_MODELS_MUTATION =
  'mutation($models:[CustomizationImport!]!){ import_models(_id_remap:false,_index_rebuild:false, models:$models){ ids } }';

/**
 * Re-import all fixtures over admin GraphQL — the START-OF-RUN RESET (AC#5). Upsert
 * semantics restore every fixture's properties (status/label/allowed_tools) to baseline
 * so a local re-run is repeatable WITHOUT a full `data clean`. `gql(query, variables)`
 * is the caller's admin client (returns the parsed JSON response).
 */
export async function applyReset(gql) {
  const u = await gql(IMPORT_USERS_MUTATION, { users: userImports() });
  if (u?.errors) throw new Error('seed import_users failed: ' + JSON.stringify(u.errors));
  const m = await gql(IMPORT_MODELS_MUTATION, { models: modelImports() });
  if (m?.errors) throw new Error('seed import_models failed: ' + JSON.stringify(m.errors));
  return { users: u?.data?.import_users?.ids || [], models: m?.data?.import_models?.ids || [] };
}

export { USERS, EVENTS };
