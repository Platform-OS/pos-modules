/**
 * pos-module-mcp — shared test fixtures (user matrix).
 *
 * Seeds a per-run matrix of REAL platformOS users with distinct MCP roles (on their
 * user-module profile), using the instance ADMIN api token (MCP_TOKEN / MPKIT_TOKEN) over
 * admin GraphQL. Every fixture is a genuine user (email + password) so both browser-login
 * (operator console, eval) and bearer-token MCP calls work — nothing hardwired.
 *
 * Imported by eval.mjs and the coverage suite; conformance.mjs keeps its own
 * self-contained user:999 seed. NON-DESTRUCTIVE: seeds only its own run-tagged rows and
 * tears them down by id. The ledger is left intact (append-only, tamper-evident) — the
 * CI instance is ephemeral and released after the run anyway.
 *
 * Matrix:
 *   operator  mcp_operator  +token   console / approvals / eval / ledger export
 *   member    mcp_user      +token   normal tool calls, idempotency, own token
 *   outsider  (no role)     +token   authz-deny: authenticated but unauthorized
 *
 * Env (optional; falls back to the repo .pos "ps" env):
 *   MCP_URL   - instance base url
 *   MCP_TOKEN - instance ADMIN api token
 */
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const T_PROFILE = 'modules/user/profile';
const T_TOKEN = 'modules/mcp/mcp_token';
const T_RATE = 'modules/mcp/mcp_rate_counter';

export function loadEnv() {
  let url = process.env.MCP_URL, token = process.env.MCP_TOKEN;
  if (!url || !token) {
    try {
      const here = dirname(fileURLToPath(import.meta.url));
      const dotpos = JSON.parse(readFileSync(resolve(here, '../.pos'), 'utf8'));
      const env = dotpos.ps || Object.values(dotpos)[0];
      url = url || env.url; token = token || env.token;
    } catch (e) { console.error('No MCP_URL/MCP_TOKEN and .pos unreadable:', e.message); process.exit(2); }
  }
  if (!url.endsWith('/')) url += '/';
  return { base: url, admin: token };
}

/** Admin GraphQL client (same shape conformance.mjs uses). */
export function makeAdmin({ base, admin }) {
  const GQL = base + 'api/graph';
  async function gql(query, variables = {}) {
    const res = await fetch(GQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Token ' + admin },
      body: JSON.stringify({ query, variables }),
    });
    return res.json();
  }
  async function recordCreate(table, props) {
    const properties = Object.entries(props).map(([n, v]) =>
      typeof v === 'number' ? `{ name: "${n}", value_int: ${v} }`
        : Array.isArray(v) ? `{ name: "${n}", value_array: ${JSON.stringify(v)} }`
        : `{ name: "${n}", value: ${JSON.stringify(v)} }`).join(' ');
    const r = await gql(`mutation { record_create(record: { table: "${table}" properties: [ ${properties} ] }) { id } }`);
    if (!r?.data?.record_create?.id) throw new Error(`record_create ${table} failed: ${JSON.stringify(r?.errors || r)}`);
    return r.data.record_create.id;
  }
  async function recordDelete(table, id) {
    await gql(`mutation { record_delete(id: ${id}, table: "${table}") { id } }`);
  }
  return { gql, recordCreate, recordDelete, base };
}

/** Stable-ish run id: GitHub run id in CI, else a short local token. Callers may override. */
export function defaultRunId() {
  return process.env.GITHUB_RUN_ID || (Date.now().toString(36) + randomBytes(2).toString('hex'));
}

/**
 * Create one real platform user with a user-module profile (carrying `role`, when given —
 * mcp_user or mcp_operator) and optionally a bearer token.
 * @returns handle { key, userId, email, password, principal, role, rawToken, profileId, tokenId }
 */
export async function makeUser(adm, { runId, key, role = null, withToken = false, label }) {
  const email = `mcp-ci+${key}-${runId}@test.local`;
  const password = 'Ci!' + randomBytes(12).toString('hex');
  const u = await adm.gql(
    `mutation($u: UserInputType!){ user_create(user: $u) { id } }`,
    { u: { email, password, name: `CI ${key} ${runId}` } });
  const userId = u?.data?.user_create?.id;
  if (!userId) throw new Error(`user_create failed for ${key}: ${JSON.stringify(u?.errors || u)}`);

  const profileId = await adm.recordCreate(T_PROFILE, {
    user_id: userId, email, name: `CI ${key} ${runId}`, roles: role ? [role] : [],
  });

  let rawToken = null, tokenId = null;
  if (withToken) {
    rawToken = 'mcp_ci_' + randomBytes(16).toString('hex');
    const digest = createHash('sha256').update(rawToken).digest('hex');
    tokenId = await adm.recordCreate(T_TOKEN, {
      user_id: userId, token_digest: digest, label: label || `ci-${key}`, status: 'active',
    });
  }

  return { key, userId, email, password, principal: 'user:' + userId, role, rawToken, profileId, tokenId };
}

/** Seed the three-user matrix. Returns { operator, member, outsider }. */
export async function seedMatrix(adm, { runId } = {}) {
  runId = runId || defaultRunId();
  const operator = await makeUser(adm, { runId, key: 'operator', role: 'mcp_operator', withToken: true, label: 'ci-operator' });
  const member = await makeUser(adm, { runId, key: 'member', role: 'mcp_user', withToken: true, label: 'ci-member' });
  const outsider = await makeUser(adm, { runId, key: 'outsider', role: null, withToken: true, label: 'ci-outsider' });
  return { runId, operator, member, outsider };
}

/** Prune this principal's rate-counter rows (keys are "principal:<id>:<window>"). */
export async function pruneRate(adm, principal) {
  const r = await adm.gql(`{ records(per_page: 200, filter: { table: { value: "${T_RATE}" } properties: [{ name: "key", starts_with: "principal:${principal}" }] }) { results { id } } }`);
  for (const row of r?.data?.records?.results || []) await adm.recordDelete(T_RATE, row.id);
}

/** Best-effort teardown: delete each fixture's token row, profile, rate counters, then the user. */
export async function teardownMatrix(adm, matrix) {
  for (const [k, h] of Object.entries(matrix)) {
    if (k === 'runId' || !h || !h.userId) continue;
    try { if (h.tokenId) await adm.recordDelete(T_TOKEN, h.tokenId); } catch {}
    try { if (h.profileId) await adm.recordDelete(T_PROFILE, h.profileId); } catch {}
    try { await pruneRate(adm, h.principal); } catch {}
    try { await adm.gql(`mutation($id: ID!){ user_delete(id: $id) { id } }`, { id: h.userId }); } catch {}
  }
}

// Run directly for a smoke check: `node fixtures.mjs [seed|teardown-seed]`
if (import.meta.url === `file://${process.argv[1]}`) {
  const adm = makeAdmin(loadEnv());
  const m = await seedMatrix(adm, {});
  const summary = Object.fromEntries(Object.entries(m).filter(([k]) => k !== 'runId')
    .map(([k, h]) => [k, { userId: h.userId, principal: h.principal, role: h.role, token: h.rawToken ? 'yes' : 'no' }]));
  console.log('seeded matrix (runId=' + m.runId + '):');
  console.log(JSON.stringify(summary, null, 2));
  if (process.argv[2] !== 'seed') { await teardownMatrix(adm, m); console.log('torn down.'); }
  else console.log('left seeded (runId=' + m.runId + ').');
}
