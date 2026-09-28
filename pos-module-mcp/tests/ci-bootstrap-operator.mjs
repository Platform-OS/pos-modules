#!/usr/bin/env node
/**
 * CI helper — make the MCP_OP_EMAIL user an MCP operator on a freshly-deployed
 * instance, so eval.mjs (which drives the operator console) can run. Idempotent:
 * sets MCP_ADMIN_USER_IDS (the bootstrap allowlist) to that user's id.
 *
 * conformance.mjs and coverage.mjs do NOT need this — they seed their own principals.
 * This exists only for eval.mjs, which authenticates as MCP_OP_EMAIL.
 *
 * Env: MCP_URL, MCP_TOKEN (admin), MCP_OP_EMAIL. Falls back to the repo .pos "ps".
 */
import { loadEnv, makeAdmin } from './fixtures.mjs';

const { base, admin } = loadEnv();
const adm = makeAdmin({ base, admin });
const email = process.env.MCP_OP_EMAIL;
if (!email) { console.error('MCP_OP_EMAIL not set'); process.exit(2); }

const u = await adm.gql(`{ users(per_page: 1, filter: { email: { value: "${email}" } }) { results { id } } }`);
const id = u?.data?.users?.results?.[0]?.id;
if (!id) { console.error('no platformOS user found for ' + email); process.exit(2); }

await adm.gql(`mutation { constant_set(name: "MCP_ADMIN_USER_IDS", value: "${id}") { name } }`);
console.log('bootstrapped MCP operator: ' + email + ' (user id ' + id + ')');
