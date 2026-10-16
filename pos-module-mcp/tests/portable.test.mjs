/**
 * pos-module-mcp — portable conformance suite, Vitest.
 *
 * Checks the protocol behaviour of the module on ANY instance that has it installed —
 * this repository's test app or a real application — without the test harness:
 *   - it needs no harness tools, test tables, fixed fixture users or test constants;
 *   - it never changes the instance configuration: MCP_CONFIG is only READ, and the
 *     expectations follow it (tools_list_scope, oauth.challenge_initialize,
 *     defaults.max_input_bytes);
 *   - it calls no tool with a valid token and reads no app resource, so it writes no
 *     ledger row and runs no app code that changes data;
 *   - it creates exactly one platformOS user, a user-module profile for that user carrying
 *     one role, and one MCP token (random values, the raw token kept in memory only), and
 *     deletes all three at the end. The last test proves the ledger holds no row for that
 *     user. A token works only while its user holds MCP access, so the role must be one
 *     that grants `mcp.tokens.manage` on the instance: MCP_PORTABLE_ROLE, default
 *     `mcp_user` (the role the module's docs map to that permission).
 *
 * Run:  MCP_URL=https://<instance>/ MCP_TOKEN=<instance admin API token> npx vitest run tests/portable.test.mjs
 *       Without MCP_URL/MCP_TOKEN it uses the repository .pos "ps" environment. Set
 *       MCP_PORTABLE_ROLE when the instance grants MCP access through another role.
 * MUST run serially with the other suites (see vitest.config.mjs).
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { loadEnv, makeAdmin, makeMcp, makeModern, MODERN_VERSION } from './lib/harness.mjs';

const T_TOKEN = 'modules/mcp/mcp_token';
const T_LEDGER = 'modules/mcp/mcp_ledger';
const T_PROFILE = 'modules/user/profile';
const ACCESS_ROLE = process.env.MCP_PORTABLE_ROLE || 'mcp_user';

const { base, admin } = loadEnv();
const adm = makeAdmin({ base, admin });
const mcp = makeMcp(base);
const modern = makeModern(base);
const MCP = mcp.MCP;
const ok = (name, cond, detail) => expect.soft(!!cond, detail ? `${name} — ${detail}` : name).toBe(true);

let cfg = {};
let user = null;   // { userId, principal, tokenId, rawToken }
let tokenId = null;
let profileId = null;

const challenge = () => cfg?.oauth?.challenge_initialize === true;
const principalScoped = () => cfg?.tools_list_scope === 'principal';
const legacy = (method, params, token, id = 1) => mcp.rpc({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) }, token);
const wwwAuth = (r) => r.headers.get('www-authenticate') || '';

async function createCaller() {
  const run = Date.now().toString(36) + randomBytes(3).toString('hex');
  const email = `mcp-portable-${run}@test.invalid`;
  const created = await adm.gql('mutation($u: UserInputType!){ user_create(user: $u) { id } }', { u: { email, password: 'Pt!' + randomBytes(16).toString('hex') } });
  const userId = created?.data?.user_create?.id;
  if (!userId) throw new Error('user_create failed: ' + JSON.stringify(created?.errors || created));
  user = { userId: String(userId), principal: 'user:' + userId, rawToken: 'mcp_portable_' + randomBytes(24).toString('hex') };
  profileId = await adm.recordCreate(T_PROFILE, { user_id: user.userId, email, name: 'MCP portable ' + run, roles: [ACCESS_ROLE] });
  const digest = createHash('sha256').update(user.rawToken).digest('hex');
  tokenId = await adm.recordCreate(T_TOKEN, { user_id: user.userId, token_digest: digest, label: 'portable-' + run, status: 'active' });
}

async function removeCaller() {
  if (tokenId) await adm.recordDelete(T_TOKEN, tokenId);
  if (profileId) await adm.recordDelete(T_PROFILE, profileId);
  if (user) await adm.gql('mutation($id: ID!){ user_delete(id: $id) { id } }', { id: user.userId });
}

async function allToolNames(token) {
  const names = [];
  let cursor;
  for (let page = 0; page < 50; page++) {
    const r = await legacy('tools/list', cursor ? { cursor } : {}, token, 100 + page);
    for (const t of r.json?.result?.tools || []) names.push(t);
    cursor = r.json?.result?.nextCursor;
    if (!cursor) break;
  }
  return names;
}

describe('portable conformance · any instance with the module', () => {
  beforeAll(async () => {
    const c = await adm.gql('{ constants(per_page: 1, filter: { name: { value: "MCP_CONFIG" } }) { results { value } } }');
    if (c?.errors) throw new Error('reading MCP_CONFIG failed: ' + JSON.stringify(c.errors));
    const raw = c?.data?.constants?.results?.[0]?.value;
    if (raw) { try { cfg = JSON.parse(raw); } catch { cfg = {}; } }
    await createCaller();
  });

  afterAll(async () => {
    await removeCaller();
    const t = await adm.gql(`{ records(per_page: 1, filter: { id: { value: ${tokenId} }, table: { value: "${T_TOKEN}" } }) { total_entries } }`);
    expect(t?.data?.records?.total_entries, 'the token row was deleted').toBe(0);
    const p = await adm.gql(`{ records(per_page: 1, filter: { id: { value: ${profileId} }, table: { value: "${T_PROFILE}" } }) { total_entries } }`);
    expect(p?.data?.records?.total_entries, 'the profile was deleted').toBe(0);
    const u = await adm.gql(`{ users(per_page: 1, filter: { id: { value: ${user.userId} } }) { total_entries } }`);
    expect(u?.data?.users?.total_entries, 'the user was deleted').toBe(0);
  });

  it('transport and envelope', async () => {
    const initToken = challenge() ? user.rawToken : undefined;
    const init = await legacy('initialize', {}, initToken);
    ok('initialize → 200 with the default legacy revision', init.status === 200 && init.json?.result?.protocolVersion === '2025-06-18', init.text.slice(0, 160));
    ok('initialize → server info and capabilities', !!init.json?.result?.serverInfo?.name && !!init.json?.result?.capabilities?.tools);
    const ping = await legacy('ping', undefined, user.rawToken, 2);
    ok('ping → 200 empty result', ping.status === 200 && ping.json?.result && Object.keys(ping.json.result).length === 0);
    const unknown = await legacy('no/such-method', {}, undefined, 3);
    ok('unknown method → 200 -32601 (legacy: a method-level error is not a transport failure)', unknown.status === 200 && unknown.json?.error?.code === -32601);
    const noMethod = await mcp.rpc({ jsonrpc: '2.0', id: 4 });
    ok('missing method → 400 -32600', noMethod.status === 400 && noMethod.json?.error?.code === -32600);
    const badVersion = await mcp.rpc({ jsonrpc: '1.0', id: 5, method: 'ping' });
    ok('jsonrpc other than 2.0 → 400 -32600', badVersion.status === 400 && badVersion.json?.error?.code === -32600);
    const notification = await mcp.rpc({ jsonrpc: '2.0', method: 'notifications/initialized' });
    ok('notification → 202 without a body', notification.status === 202 && notification.text.length === 0);
    const limit = Number(cfg?.defaults?.max_input_bytes) || 65536;
    const oversize = await legacy('ping', { x: 'a'.repeat(limit + 1024) }, undefined, 6);
    ok('request over max_input_bytes → 413 -32600', oversize.status === 413 && oversize.json?.error?.code === -32600, 'status=' + oversize.status);
    for (const method of ['GET', 'DELETE']) {
      const r = await fetch(MCP, { method });
      ok(`${method} /mcp → 405 Allow: POST`, r.status === 405 && /POST/.test(r.headers.get('allow') || ''), 'status=' + r.status);
    }
  });

  it('credentials: missing, invalid and valid bearer tokens', async () => {
    const noToken = await legacy('tools/call', { name: 'mcp_approval_status', arguments: { handle: 'x' } });
    ok('tools/call without a token → 401 -32001 with the resource metadata challenge', noToken.status === 401 && noToken.json?.error?.code === -32001 && /Bearer resource_metadata="/.test(wwwAuth(noToken)), 'status=' + noToken.status);
    const badCall = await legacy('tools/call', { name: 'mcp_approval_status', arguments: { handle: 'x' } }, 'not-a-real-token');
    ok('tools/call with an invalid token → 401 "Invalid token"', badCall.status === 401 && badCall.json?.error?.message === 'Invalid token');
    for (const m of ['tools/list', 'prompts/list', 'resources/list', 'resources/templates/list', 'ping', 'initialize']) {
      const r = await legacy(m, {}, 'not-a-real-token', 7);
      ok(`invalid token on ${m} → 401 invalid_token`, r.status === 401 && /error="invalid_token"/.test(wwwAuth(r)), `status=${r.status}`);
    }
    if (!challenge()) {
      const open = await legacy('tools/list', {}, undefined, 8);
      ok('no token on tools/list → 200 (discovery stays open)', open.status === 200 && Array.isArray(open.json?.result?.tools));
    } else {
      const challenged = await legacy('initialize', {}, undefined, 8);
      ok('challenge_initialize: initialize without a token → 401 with the challenge', challenged.status === 401 && /resource_metadata=/.test(wwwAuth(challenged)));
    }
    const valid = await legacy('tools/list', {}, user.rawToken, 9);
    ok('valid token on tools/list → 200', valid.status === 200 && Array.isArray(valid.json?.result?.tools));
    const metadata = await fetch(base + '.well-known/oauth-protected-resource').then(r => r.json()).catch(() => null);
    ok('protected resource metadata names this /mcp endpoint', metadata?.resource === MCP && Array.isArray(metadata?.bearer_methods_supported), JSON.stringify(metadata || {}).slice(0, 160));
  });

  it('discovery results have the MCP shape', async () => {
    const tools = await allToolNames(user.rawToken);
    const names = tools.map(t => t.name);
    ok('the built-in mcp_approval_status tool is listed for a signed-in caller', names.includes('mcp_approval_status'), names.join(','));
    ok('tool names are unique', new Set(names).size === names.length);
    for (const t of tools) {
      ok(`tool ${t.name}: valid name, description and object inputSchema`, /^[a-z][a-z0-9_]{2,63}$/.test(t.name) && typeof t.description === 'string' && t.description.length > 0 && t.inputSchema?.type === 'object', JSON.stringify(t).slice(0, 160));
    }
    if (principalScoped()) {
      const anonymous = await legacy('tools/list', {}, undefined, 10);
      ok('tools_list_scope principal: an anonymous caller is advertised no tools', (anonymous.json?.result?.tools || []).length === 0);
    }

    const prompts = (await legacy('prompts/list', {}, user.rawToken, 11)).json?.result?.prompts;
    ok('prompts/list → an array', Array.isArray(prompts));
    for (const p of prompts || []) {
      const argsOk = p.arguments === undefined || (Array.isArray(p.arguments) && p.arguments.every(a => typeof a.name === 'string' && typeof a.required === 'boolean'));
      ok(`prompt ${p.name}: valid name, description and arguments`, /^[a-z][a-z0-9_]{2,63}$/.test(p.name) && typeof p.description === 'string' && argsOk, JSON.stringify(p).slice(0, 160));
    }
    const unknownPrompt = await legacy('prompts/get', { name: 'no_such_prompt_portable' }, user.rawToken, 12);
    ok('prompts/get of an unknown prompt → -32602', unknownPrompt.json?.error?.code === -32602);

    const resources = (await legacy('resources/list', {}, user.rawToken, 13)).json?.result?.resources;
    ok('resources/list → an array of {uri, name}', Array.isArray(resources) && resources.every(r => typeof r.uri === 'string' && typeof r.name === 'string'));
    const templates = (await legacy('resources/templates/list', {}, user.rawToken, 14)).json?.result?.resourceTemplates;
    ok('resources/templates/list → an array of {uriTemplate, name}', Array.isArray(templates) && templates.every(t => typeof t.uriTemplate === 'string' && typeof t.name === 'string'));
    const unknownPage = await legacy('resources/read', { uri: 'mcp+page:///no-such-portable-page' }, undefined, 15);
    ok('resources/read of an unknown page → -32002', unknownPage.json?.error?.code === -32002);
  });

  it('modern revision (2026-07-28)', async () => {
    const send = modern.send;
    const discoverToken = challenge() ? user.rawToken : undefined;
    const discover = await send('server/discover', {}, { token: discoverToken });
    const result = discover.json?.result || {};
    ok('server/discover → the modern revision, capabilities and server identity', discover.status === 200 && (result.supportedVersions || []).includes(MODERN_VERSION) && !!result.capabilities?.tools && !!result._meta?.['io.modelcontextprotocol/serverInfo']?.name, discover.text.slice(0, 200));
    ok('server/discover → resultType complete, cacheScope public, ttlMs', result.resultType === 'complete' && result.cacheScope === 'public' && typeof result.ttlMs === 'number');
    const badToken = await send('server/discover', {}, { token: 'not-a-real-token' });
    ok('invalid token on server/discover → 401 invalid_token', badToken.status === 401 && /error="invalid_token"/.test(wwwAuth(badToken)));

    const toolsList = await send('tools/list', {}, { token: user.rawToken });
    ok('signed-in tools/list → resultType complete + cache hint', toolsList.json?.result?.resultType === 'complete' && typeof toolsList.json?.result?.ttlMs === 'number');
    ok('tools/list cacheScope follows tools_list_scope', toolsList.json?.result?.cacheScope === (principalScoped() ? 'private' : 'public'), 'scope=' + toolsList.json?.result?.cacheScope);
    for (const m of ['prompts/list', 'resources/list', 'resources/templates/list']) {
      const r = await send(m, {}, { token: user.rawToken });
      ok(`signed-in ${m} → cacheScope private`, r.status === 200 && r.json?.result?.cacheScope === 'private', `${r.status} scope=${r.json?.result?.cacheScope}`);
    }

    const mismatch = await send('tools/list', {}, { token: user.rawToken, headers: { 'MCP-Protocol-Version': '2025-06-18' } });
    ok('MCP-Protocol-Version header differs from _meta → 400 -32020', mismatch.status === 400 && mismatch.json?.error?.code === -32020);
    const unsupported = await send('tools/list', {}, { token: user.rawToken, version: '2099-01-01' });
    ok('unsupported revision → 400 -32022', unsupported.status === 400 && unsupported.json?.error?.code === -32022);
    const noMethodHeader = await send('tools/list', {}, { token: user.rawToken, omitHeaders: ['Mcp-Method'] });
    ok('missing Mcp-Method header → 400 -32020', noMethodHeader.status === 400 && noMethodHeader.json?.error?.code === -32020);
    const removed = await send('ping', {}, { token: user.rawToken });
    ok('ping (removed in this revision) → 404 -32601', removed.status === 404 && removed.json?.error?.code === -32601);
    const unknownPage = await send('resources/read', { uri: 'mcp+page:///no-such-portable-page' }, { token: user.rawToken });
    ok('unknown resource → -32602 (the revision retired -32002)', unknownPage.json?.error?.code === -32602);
    const tasksUndeclared = await send('tasks/get', { taskId: 'x' }, { token: user.rawToken });
    ok('tasks/* without the Tasks extension → 400 -32021', tasksUndeclared.status === 400 && tasksUndeclared.json?.error?.code === -32021);
  });

  it('leaves no ledger row for its caller', async () => {
    const r = await adm.gql(`{ records(per_page: 1, filter: { table: { value: "${T_LEDGER}" } properties: [{ name: "principal_id", value: "${user.principal}" }] }) { total_entries } }`);
    ok('no ledger row was written for the suite caller', r?.data?.records?.total_entries === 0, 'rows=' + r?.data?.records?.total_entries);
  });
});
