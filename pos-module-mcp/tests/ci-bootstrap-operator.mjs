#!/usr/bin/env node
/**
 * CI helper — make the MCP_OP_EMAIL user an MCP operator on a freshly-deployed
 * instance, so eval.mjs (which drives the operator console) can run. Idempotent:
 * appends the `mcp_operator` role to that user's user-module profile, creating the
 * profile first when the user has none (e.g. the instance owner, created outside the
 * user module's registration flow).
 *
 * conformance.mjs and coverage.mjs do NOT need this — they seed their own principals.
 * This exists only for eval.mjs, which authenticates as MCP_OP_EMAIL.
 *
 * Env: MCP_URL, MCP_TOKEN (admin), MCP_OP_EMAIL. Falls back to the repo .pos "ps".
 */
import { loadEnv, makeAdmin } from './fixtures.mjs';

const ROLE = 'mcp_operator';
const { base, admin } = loadEnv();
const adm = makeAdmin({ base, admin });
const email = process.env.MCP_OP_EMAIL;
if (!email) { console.error('MCP_OP_EMAIL not set'); process.exit(2); }

const u = await adm.gql(`{ users(per_page: 1, filter: { email: { value: ${JSON.stringify(email)} } }) { results { id } } }`);
const id = u?.data?.users?.results?.[0]?.id;
if (!id) { console.error('no platformOS user found for ' + email); process.exit(2); }

const p = await adm.gql(`{ records(per_page: 1, filter: { table: { value: "modules/user/profile" } properties: [{ name: "user_id", value: "${id}" }] }) { results { id roles: property_array(name: "roles") } } }`);
const profile = p?.data?.records?.results?.[0];
if (!profile) {
  await adm.recordCreate('modules/user/profile', { user_id: String(id), email, roles: [ROLE] });
} else if (!(profile.roles || []).includes(ROLE)) {
  const r = await adm.gql(`mutation { record_update(id: ${profile.id}, record: { table: "modules/user/profile" properties: [{ name: "roles", array_append: "${ROLE}" }] }) { id } }`);
  if (r?.errors) { console.error('role append failed: ' + JSON.stringify(r.errors)); process.exit(1); }
}
console.log('bootstrapped MCP operator: ' + email + ' (user id ' + id + ', role ' + ROLE + ')');
