/**
 * pos-module-mcp — conformance + adversarial suite (spec §19), Vitest.
 *
 * Full governance pipeline over real HTTP against a deployed instance, ledger asserted
 * via GraphQL. Same suite as the original conformance.mjs: the MCP client comes from
 * ./lib/harness.mjs (wrapped to keep the `{token}` call signature verbatim); `ok()` is
 * `expect.soft`; groups → `it`, setup → `beforeAll`, `finally` → `afterAll`.
 *
 * NON-DESTRUCTIVE: isolated conformance principal (deterministic fixtures; TASK-5), own
 * marked event/token/page; resets only the transient MCP_CONFIG + its own rate counters +
 * seeded doc page. MUST run serially / single-instance (see vitest.config.mjs).
 *
 * Run:  npx vitest run tests/conformance.test.mjs
 * Env:  MCP_URL, MCP_TOKEN (admin api token) — falls back to the repo .pos "ps".
 */
import { describe, it, beforeAll, afterAll, afterEach, expect } from 'vitest';
import { loadEnv, makeAdmin, makeMcp, makeConstants } from './lib/harness.mjs';
import { FIXT, applyReset } from './seed/seed.mjs';

// ---- isolated conformance identity + fixtures (deterministic; TASK-5) ------
const RAW_TOKEN = FIXT.users.conformance.rawToken;
const CONF_PRINCIPAL = FIXT.users.conformance.principal;
const CONF_KEYWORD = FIXT.confKeyword;              // matches ONLY the seeded fixture event
const TABLE_LEDGER = 'modules/mcp/mcp_ledger';
const TABLE_RATE = 'modules/mcp/mcp_rate_counter';

const { base, admin } = loadEnv();
const adm = makeAdmin({ base, admin });
const gql = adm.gql;
const mcp = makeMcp(base);
const MCP = mcp.MCP;
// Preserve the original rpc(body, { token }) call shape used throughout the groups.
const rpc = (body, opts) => mcp.rpc(body, opts?.token);
const { setConstant, unsetConstant } = makeConstants(adm);

const ok = (name, cond, detail) => expect.soft(cond === true || cond === false ? cond : !!cond, detail ? `${name} — ${detail}` : name).toBe(true);

async function pruneRate() {
  // Rate keys are "principal:<id>:<window>" — match the full scope prefix.
  const r = await gql(`{ records(per_page: 200, filter: { table: { value: "${TABLE_RATE}" } properties: [{ name: "key", starts_with: "principal:${CONF_PRINCIPAL}" }] }) { results { id } } }`);
  for (const row of r?.data?.records?.results || []) await adm.recordDelete(TABLE_RATE, row.id);
}
// Seed/delete a live markdown doc PAGE so the resources test owns its own fixture
// (pages are code, not records — created via the admin API, removed by slug prefix).
async function pageCreate(slug, content, title) {
  const r = await gql(`mutation($p: PageInputType!){ admin_page_create(page: $p){ id slug } }`, {
    p: { slug, format: 'html', handler: 'liquid', content, manually_managed: true,
         physical_file_path: 'modules/mcp/public/views/pages/' + slug + '.liquid',
         metadata: { title: title || slug, description: 'conformance-seeded doc resource' } },
  });
  if (r?.errors) throw new Error('admin_page_create: ' + JSON.stringify(r.errors));
  return r?.data?.admin_page_create;
}
async function pagesDeleteByPrefix(prefix) {
  await gql(`mutation($f: PageFilterInput!){ admin_pages_delete_all(filter: $f){ count } }`, { f: { slug: { starts_with: prefix } } });
}

// Direct POST with arbitrary headers (the protocol-negotiation suite exercises the
// MCP-Protocol-Version / Mcp-Method / Mcp-Name routing headers).
async function rpcH(body, headers = {}) {
  const res = await fetch(MCP, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

describe('conformance · protocol + governance pipeline', () => {
  beforeAll(async () => {
    await unsetConstant('MCP_CONFIG'); // ensure clean config baseline
    // Deterministic fixtures (TASK-5): (re-)import the fixed conformance user + token + event.
    await applyReset(gql);
  });

  afterAll(async () => {
    // Reset transient state only; the fixed fixtures PERSIST and are re-baselined next run.
    await unsetConstant('MCP_CONFIG');
    await pruneRate();
    try { await pagesDeleteByPrefix('docs/conf-' + CONF_KEYWORD); } catch {}
  });

  // Guard between groups (idempotent).
  afterEach(async () => { try { await unsetConstant('MCP_CONFIG'); } catch {} });

  it('Transport / envelope (§13)', async () => {
    const init = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    ok('initialize → 200 + pinned protocol', init.status === 200 && init.json?.result?.protocolVersion === '2025-06-18', init.json?.result?.protocolVersion);
    ok('initialize advertises instructions', typeof init.json?.result?.instructions === 'string' && init.json.result.instructions.length > 0);
    const ping = await rpc({ jsonrpc: '2.0', id: 2, method: 'ping' });
    ok('ping → 200 empty result', ping.status === 200 && ping.json?.result && Object.keys(ping.json.result).length === 0);
    const unk = await rpc({ jsonrpc: '2.0', id: 3, method: 'no/such' });
    ok('unknown method → -32601/400', unk.status === 400 && unk.json?.error?.code === -32601);
    const bad = await rpc({ jsonrpc: '2.0', id: 4 });
    ok('missing method → -32600/400', bad.status === 400 && bad.json?.error?.code === -32600);
    const badver = await rpc({ jsonrpc: '1.0', id: 5, method: 'ping' });
    ok('bad jsonrpc → -32600/400', badver.status === 400 && badver.json?.error?.code === -32600);
    const notif = await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' });
    ok('notification → 202 no body', notif.status === 202 && notif.text.length === 0);
    const over = await rpc({ jsonrpc: '2.0', id: 6, method: 'ping', params: { x: 'a'.repeat(70000) } });
    ok('oversize >64KB → 413/-32600', over.status === 413 && over.json?.error?.code === -32600);
  });

  it('Identity (§9)', async () => {
    const noTok = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_events', arguments: { query: 'x' } } });
    ok('no token → 401', noTok.status === 401 && noTok.json?.error?.code === -32001);
    ok('no token → WWW-Authenticate', /Bearer resource_metadata=/.test(noTok.headers.get('www-authenticate') || ''));
    const badTok = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'search_events', arguments: { query: 'x' } } }, { token: 'wrong' });
    ok('bad token → 401 no internals', badTok.status === 401 && badTok.json?.error?.message === 'Invalid token');
    const wk = await fetch(base + '.well-known/oauth-protected-resource').then(r => r.json());
    ok('well-known resource metadata', wk.resource === MCP && Array.isArray(wk.bearer_methods_supported));
  });

  it('Discovery / tools/list (§14)', async () => {
    const list = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const tools = list.json?.result?.tools || [];
    const t = tools.find(x => x.name === 'search_events');
    ok('tools/list includes search_events', !!t);
    ok('tool exposes inputSchema + _meta.version', !!t?.inputSchema && t?._meta?.version === '1.0.0');
  });

  it('Validation (§10, strict, no coercion)', async () => {
    const T = { token: RAW_TOKEN };
    const missing = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_events', arguments: { limit: 5 } } }, T);
    ok('missing required → -32602', missing.json?.error?.code === -32602 && /missing required property/.test(JSON.stringify(missing.json.error.data)));
    const coerce = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'search_events', arguments: { query: 'x', limit: '5' } } }, T);
    ok('string-for-int rejected (no coercion)', coerce.json?.error?.code === -32602 && /expected integer/.test(JSON.stringify(coerce.json.error.data)));
    const unknown = await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'search_events', arguments: { query: 'x', bogus: 1 } } }, T);
    ok('unknown key rejected (additionalProperties false)', unknown.json?.error?.code === -32602 && /unknown property/.test(JSON.stringify(unknown.json.error.data)));
    const overmax = await rpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'search_events', arguments: { query: 'x', limit: 999 } } }, T);
    ok('above maximum rejected', overmax.json?.error?.code === -32602 && /above maximum/.test(JSON.stringify(overmax.json.error.data)));
    const unknownTool = await rpc({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'ghost', arguments: {} } }, T);
    ok('unknown tool → -32602', unknownTool.json?.error?.code === -32602);
  });

  it('Execution end-to-end (§22 proof)', async () => {
    const T = { token: RAW_TOKEN };
    const call = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_events', arguments: { query: CONF_KEYWORD } } }, T);
    ok('tools/call executes → 200 not isError', call.status === 200 && call.json?.result?.isError === false);
    ok('returns our seeded event (structuredContent)', call.json?.result?.structuredContent?.count === 1 && /Conformance Jazz/.test(JSON.stringify(call.json.result.structuredContent)));
    const empty = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'search_events', arguments: { query: 'zzznomatch' + CONF_KEYWORD } } }, T);
    ok('empty result → count 0, not error', empty.json?.result?.structuredContent?.count === 0 && empty.json.result.isError === false);
  });

  it('Adversarial (§19.2)', async () => {
    const T = { token: RAW_TOKEN };
    const inj = ["'; DROP TABLE users; --", '{{ 7 | plus: 7 }}', '{% assign x = 1 %}', '</script><img src=x>'];
    let clean = true, leaked = false;
    for (const p of inj) {
      const r = await rpc({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'search_events', arguments: { query: p } } }, T);
      if (r.status !== 200 || r.json?.result?.isError !== false) clean = false;
      if (/\b14\b|SQL syntax|Liquid error|ActiveRecord|stack trace/i.test(r.text)) leaked = true;
    }
    ok('injection payloads handled as data (no exec, no 500)', clean);
    ok('no engine internals leaked on injection', !leaked);
  });

  it('Resources (§3.2, config-gated)', async () => {
    const off = await rpc({ jsonrpc: '2.0', id: 1, method: 'resources/list' });
    ok('resources OFF by default → empty', (off.json?.result?.resources || []).length === 0);

    // Self-contained fixture: seed a docs-prefixed page we own (cleaned up in afterAll).
    const docSlug = 'docs/conf-' + CONF_KEYWORD;
    const docUri = 'mcp+page:///' + docSlug;
    const docMarker = 'seeded-' + CONF_KEYWORD;
    try { await pagesDeleteByPrefix(docSlug); } catch {} // fixed slug now → delete any leftover first
    await pageCreate(docSlug, '# Conformance doc\n' + docMarker, 'Conformance Doc');

    await setConstant('MCP_CONFIG', JSON.stringify({ resources: { expose_markdown_pages: true } }));
    // Allow a beat for the new page + constant to become visible (poll, don't sleep-guess).
    let onRes = [];
    for (let a = 0; a < 6; a++) {
      const on = await rpc({ jsonrpc: '2.0', id: 2, method: 'resources/list' });
      onRes = on.json?.result?.resources || [];
      if (onRes.some(r => r.uri === docUri)) break;
      await new Promise(res => setTimeout(res, 500));
    }
    ok('resources ON → lists our seeded docs page', onRes.some(r => r.uri === docUri));
    const readOk = await rpc({ jsonrpc: '2.0', id: 4, method: 'resources/read', params: { uri: docUri } });
    ok('resources/read returns the seeded markdown (no html leak)', JSON.stringify(readOk.json?.result || {}).includes(docMarker));
    const bad = await rpc({ jsonrpc: '2.0', id: 3, method: 'resources/read', params: { uri: 'mcp+page:///mcp' } });
    ok('read outside allowlist → not found (no leak)', bad.json?.error?.code === -32002);
    await unsetConstant('MCP_CONFIG');
  });

  it('Prompts (§13.1)', async () => {
    const list = await rpc({ jsonrpc: '2.0', id: 1, method: 'prompts/list' });
    const prompts = list.json?.result?.prompts || [];
    const p = prompts.find(x => x.name === 'draft_announcement');
    ok('prompts/list advertises draft_announcement', !!p);
    ok('prompt declares its arguments (event_name required)', !!p && Array.isArray(p.arguments) && p.arguments.some(a => a.name === 'event_name' && a.required));
    const got = await rpc({ jsonrpc: '2.0', id: 2, method: 'prompts/get', params: { name: 'draft_announcement', arguments: { event_name: 'Jazz Night', date: 'Friday' } } });
    ok('prompts/get → messages', Array.isArray(got.json?.result?.messages) && got.json.result.messages.length > 0);
    const missing = await rpc({ jsonrpc: '2.0', id: 3, method: 'prompts/get', params: { name: 'draft_announcement', arguments: { event_name: 'Jazz Night' } } });
    ok('prompts/get missing required arg → error', !!missing.json?.error, 'code=' + missing.json?.error?.code);
    const unknown = await rpc({ jsonrpc: '2.0', id: 4, method: 'prompts/get', params: { name: 'no_such_prompt', arguments: {} } });
    ok('prompts/get unknown prompt → error', !!unknown.json?.error);
  });

  it('Malformed input (§13.2)', async () => {
    // NOTE (platform limitation, documented): platformOS parses the JSON body into
    // context.params BEFORE this page runs, so a malformed application/json body is
    // rejected by the platform (HTTP 415) before dispatch — the JSON-RPC -32700 parse
    // code is unreachable from the engine. This asserts the achievable guarantee: malformed
    // input is REJECTED with a 4xx and never accepted, never 5xx, never leaks internals.
    const res = await fetch(MCP, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{ this is not : valid json' });
    const txt = await res.text();
    const leaked = /SQL|Liquid error|ActiveRecord|stack trace|undefined method/i.test(txt);
    ok('malformed JSON → 4xx rejection, no leak (platformOS 415 pre-dispatch; -32700 unreachable)', res.status >= 400 && res.status < 500 && !leaked, 'status=' + res.status);
  });

  it('Rate limiting (§12.4)', async () => {
    await setConstant('MCP_CONFIG', JSON.stringify({ defaults: { rate_limit_per_min: 3 } }));
    await pruneRate();
    const codes = [];
    for (let i = 0; i < 6; i++) {
      const r = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_events', arguments: { query: 'x' } } }, { token: RAW_TOKEN });
      codes.push(r.status);
    }
    ok('first 3 pass, then 429', codes.slice(0, 3).every(c => c === 200) && codes.slice(3).some(c => c === 429), codes.join(','));
    const limited = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'search_events', arguments: { query: 'x' } } }, { token: RAW_TOKEN });
    ok('429 carries Retry-After', limited.status !== 429 || !!limited.headers.get('retry-after'));
    await unsetConstant('MCP_CONFIG');
  });

  it('Attestation ledger (§6) — isolated principal', async () => {
    const q = `{ records(per_page: 200, filter: { table: { value: "${TABLE_LEDGER}" } properties: [{ name: "principal_id", value: "${CONF_PRINCIPAL}" }] }, sort: [{ id: { order: ASC } }]) { total_entries results { execution_outcome: property(name:"execution_outcome") input_sha256: property(name:"input_sha256") authz_decision: property(name:"authz_decision") } } }`;
    const rows = (await gql(q))?.data?.records?.results || [];
    ok('every authenticated call attested', rows.length > 0);
    ok('successful executions recorded', rows.some(x => x.execution_outcome === 'success'));
    ok('invalid/denied recorded', rows.some(x => x.execution_outcome === 'invalid'));
    ok('rate-limited recorded', rows.some(x => x.execution_outcome === 'error'));
    ok('arguments hashed, never stored raw', rows.every(x => !x.input_sha256 || /^[0-9a-f]{64}$/.test(x.input_sha256)));
    ok('authorized calls carry allow decision', rows.some(x => x.authz_decision === 'allow'));
  });
});

// ── Protocol-version negotiation + 2026-07-28 stateless compat layer ────────────────
// The server implements 2025-06-18 AND 2026-07-28 and negotiates per request. These
// assert: the negotiation precedence, that a version-less/unknown request is UNCHANGED
// (2025-06-18), that 2026-07-28 additions (cacheable lists, header routing) activate
// ONLY when explicitly negotiated, and the Mcp-Method/Mcp-Name reconciliation.
describe('conformance · protocol negotiation + 2026-07-28 compat', () => {
  it('version negotiation — default / _meta / header / legacy / unsupported', async () => {
    const none = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    ok('no version requested → default 2025-06-18 (unchanged)', none.json?.result?.protocolVersion === '2025-06-18', none.json?.result?.protocolVersion);
    ok('initialize advertises supportedProtocolVersions in _meta', Array.isArray(none.json?.result?._meta?.supportedProtocolVersions) && none.json.result._meta.supportedProtocolVersions.includes('2026-07-28') && none.json.result._meta.supportedProtocolVersions.includes('2025-06-18'));
    const meta = await rpc({ jsonrpc: '2.0', id: 2, method: 'initialize', _meta: { protocolVersion: '2026-07-28' }, params: {} });
    ok('_meta.protocolVersion 2026-07-28 → negotiated up', meta.json?.result?.protocolVersion === '2026-07-28');
    const hdr = await rpcH({ jsonrpc: '2.0', id: 3, method: 'initialize', params: {} }, { 'MCP-Protocol-Version': '2026-07-28' });
    ok('MCP-Protocol-Version header → negotiated up', hdr.json?.result?.protocolVersion === '2026-07-28');
    const legacy = await rpc({ jsonrpc: '2.0', id: 4, method: 'initialize', params: { protocolVersion: '2026-07-28' } });
    ok('legacy initialize params.protocolVersion → negotiated up', legacy.json?.result?.protocolVersion === '2026-07-28');
    const bad = await rpc({ jsonrpc: '2.0', id: 5, method: 'initialize', _meta: { protocolVersion: '1999-01-01' }, params: {} });
    ok('unsupported version → fall back to 2025-06-18 (never error)', bad.json?.result?.protocolVersion === '2025-06-18', bad.json?.result?.protocolVersion);
  });

  it('cacheable list results — 2026-07-28 only, absent for 2025-06-18', async () => {
    const tl25 = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
    ok('tools/list @2025-06-18 → NO ttlMs (byte-for-byte unchanged)', tl25.json?.result?.ttlMs === undefined && tl25.json?.result?.cacheScope === undefined);
    const tl26 = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list', _meta: { protocolVersion: '2026-07-28' }, params: {} });
    ok('tools/list @2026-07-28 → ttlMs + cacheScope:shared', typeof tl26.json?.result?.ttlMs === 'number' && tl26.json?.result?.cacheScope === 'shared', `ttlMs=${tl26.json?.result?.ttlMs} scope=${tl26.json?.result?.cacheScope}`);
    const pl26 = await rpc({ jsonrpc: '2.0', id: 3, method: 'prompts/list', _meta: { protocolVersion: '2026-07-28' }, params: {} });
    ok('prompts/list @2026-07-28 → cache hint', typeof pl26.json?.result?.ttlMs === 'number' && pl26.json?.result?.cacheScope === 'shared');
    const rl26 = await rpc({ jsonrpc: '2.0', id: 4, method: 'resources/list', _meta: { protocolVersion: '2026-07-28' }, params: {} });
    ok('resources/list @2026-07-28 → cache hint', typeof rl26.json?.result?.ttlMs === 'number');
  });

  it('header-based routing — Mcp-Method / Mcp-Name reconciliation', async () => {
    const agree = await rpcH({ jsonrpc: '2.0', id: 1, method: 'ping' }, { 'Mcp-Method': 'ping' });
    ok('Mcp-Method agrees with body → routed (ping ok)', agree.status === 200 && agree.json?.result && Object.keys(agree.json.result).length === 0);
    const supply = await rpcH({ jsonrpc: '2.0', id: 2 }, { 'Mcp-Method': 'ping' });
    ok('Mcp-Method supplies a MISSING body method → routed', supply.status === 200 && !!supply.json?.result);
    const disagree = await rpcH({ jsonrpc: '2.0', id: 3, method: 'ping' }, { 'Mcp-Method': 'tools/list' });
    ok('Mcp-Method DISAGREES with body → -32600 (no silent guess)', disagree.json?.error?.code === -32600);
    const nameBad = await rpcH({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'search_events', arguments: {} } }, { 'Mcp-Name': 'a_different_tool' });
    ok('Mcp-Name DISAGREES with tool name → -32600 (before auth)', nameBad.json?.error?.code === -32600);
  });
});
