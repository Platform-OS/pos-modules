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
import { loadEnv, makeAdmin, makeMcp, makeModern, makeConstants } from './lib/harness.mjs';
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
// Seed/delete a live LIQUID page under the docs prefix — the resources test's negative
// fixture (pages are code, not records — created via the admin API, removed by slug prefix).
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
    ok('unknown method → -32601 with HTTP 200 (method-level errors are not transport failures)', unk.status === 200 && unk.json?.error?.code === -32601, 'status=' + unk.status);
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
    // A PRESENTED bearer is checked on every method, discovery included: an invalid one is
    // 401 + error="invalid_token" (MCP authorization; RFC 6750), never an empty anonymous list.
    for (const m of ['tools/list', 'prompts/list', 'resources/list', 'initialize', 'ping']) {
      const r = await rpc({ jsonrpc: '2.0', id: 9, method: m, params: {} }, { token: 'wrong' });
      ok(`bad token on ${m} → 401 invalid_token`, r.status === 401 && /error="invalid_token"/.test(r.headers.get('www-authenticate') || ''), `status=${r.status}`);
    }
    const openList = await rpc({ jsonrpc: '2.0', id: 10, method: 'tools/list' });
    ok('no token on tools/list → still open (200)', openList.status === 200 && Array.isArray(openList.json?.result?.tools));
    const goodList = await rpc({ jsonrpc: '2.0', id: 11, method: 'tools/list' }, { token: RAW_TOKEN });
    ok('valid token on tools/list → 200', goodList.status === 200 && Array.isArray(goodList.json?.result?.tools));
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
    // Argument errors are tool execution errors (2025-11-25, SEP-1303): HTTP 200, a
    // CallToolResult with isError and the errors in its text. search_events declares an
    // outputSchema, so no structuredContent (an error object would not match it).
    const invalid = (r, re) => r.status === 200 && r.json?.result?.isError === true && re.test(r.json.result.content?.[0]?.text || '') && r.json.result.structuredContent === undefined;
    const missing = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_events', arguments: { limit: 5 } } }, T);
    ok('missing required → tool error with validation_errors', invalid(missing, /missing required property/), missing.text.slice(0, 200));
    const coerce = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'search_events', arguments: { query: 'x', limit: '5' } } }, T);
    ok('string-for-int rejected (no coercion)', invalid(coerce, /expected integer/));
    const unknown = await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'search_events', arguments: { query: 'x', bogus: 1 } } }, T);
    ok('unknown key rejected (additionalProperties false)', invalid(unknown, /unknown property/));
    const overmax = await rpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'search_events', arguments: { query: 'x', limit: 999 } } }, T);
    ok('above maximum rejected', invalid(overmax, /above maximum/));
    const unknownTool = await rpc({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'ghost', arguments: {} } }, T);
    ok('unknown tool → -32602 protocol error, HTTP 200', unknownTool.status === 200 && unknownTool.json?.error?.code === -32602, 'status=' + unknownTool.status);
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

    // Markdown fixtures are DEPLOYED app pages (app/views/pages/docs/mcp-conformance.md and
    // app/views/pages/docs-mcp-conformance-boundary.md): a page is `handler: markdown` only
    // via deployed front matter — the admin page API always stores `liquid`.
    const docSlug = 'docs/mcp-conformance';
    const docUri = 'mcp+page:///' + docSlug;
    const docMarker = 'mcp-conformance-doc-fixture';
    const boundarySlug = 'docs-mcp-conformance-boundary';
    const boundaryMarker = 'mcp-conformance-boundary-fixture';
    // Negative fixture seeded here: a LIQUID page under the prefix (its content is
    // template source, never servable).
    const liquidSlug = 'docs/conf-' + CONF_KEYWORD;
    const liquidMarker = 'seeded-' + CONF_KEYWORD;
    try { await pagesDeleteByPrefix(liquidSlug); } catch {} // fixed slug → delete any leftover first
    await pageCreate(liquidSlug, '{% comment %}' + liquidMarker + '{% endcomment %}', 'Conformance Liquid');

    await setConstant('MCP_CONFIG', JSON.stringify({ resources: { expose_markdown_pages: true } }));
    // Allow a beat for the new page + constant to become visible (poll, don't sleep-guess).
    let onRes = [];
    for (let a = 0; a < 6; a++) {
      const on = await rpc({ jsonrpc: '2.0', id: 2, method: 'resources/list' });
      onRes = on.json?.result?.resources || [];
      if (onRes.some(r => r.uri === docUri)) break;
      await new Promise(res => setTimeout(res, 500));
    }
    ok('resources ON → lists the deployed markdown docs page', onRes.some(r => r.uri === docUri));
    const readOk = await rpc({ jsonrpc: '2.0', id: 4, method: 'resources/read', params: { uri: docUri } });
    ok('resources/read returns the deployed markdown (no html leak)', JSON.stringify(readOk.json?.result || {}).includes(docMarker));
    const bad = await rpc({ jsonrpc: '2.0', id: 3, method: 'resources/read', params: { uri: 'mcp+page:///mcp' } });
    ok('read outside allowlist → not found (no leak)', bad.json?.error?.code === -32002);
    const liquidUri = 'mcp+page:///' + liquidSlug, boundaryUri = 'mcp+page:///' + boundarySlug;
    ok('liquid page under prefix → not listed', !onRes.some(r => r.uri === liquidUri));
    const liq = await rpc({ jsonrpc: '2.0', id: 5, method: 'resources/read', params: { uri: liquidUri } });
    ok('liquid page under prefix → read not found (no source leak)', liq.json?.error?.code === -32002 && !liq.text.includes(liquidMarker));
    ok('prefix without path boundary → not listed', !onRes.some(r => r.uri === boundaryUri));
    const bnd = await rpc({ jsonrpc: '2.0', id: 6, method: 'resources/read', params: { uri: boundaryUri } });
    ok('prefix without path boundary → read not found', bnd.json?.error?.code === -32002 && !bnd.text.includes(boundaryMarker));
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

    // The app's prompts partial and each template receive the caller (principal, agent).
    ok('anonymous prompts/list → no per-caller prompt', !prompts.some(x => x.name === 'caller_note'));
    const authedList = await rpc({ jsonrpc: '2.0', id: 5, method: 'prompts/list' }, { token: RAW_TOKEN });
    ok('signed-in prompts/list → the per-caller prompt is offered', (authedList.json?.result?.prompts || []).some(x => x.name === 'caller_note'));
    const note = await rpc({ jsonrpc: '2.0', id: 6, method: 'prompts/get', params: { name: 'caller_note', arguments: {} } }, { token: RAW_TOKEN });
    const noteText = note.json?.result?.messages?.[0]?.content?.text || '';
    ok('prompts/get passes the caller to the template', noteText.includes(CONF_PRINCIPAL) && noteText.includes('fixt-conformance'), noteText);
    ok('prompts/get passes the prompt entry to the template', noteText.includes('This note comes from the prompt entry.'), noteText);
    const anonNote = await rpc({ jsonrpc: '2.0', id: 7, method: 'prompts/get', params: { name: 'caller_note', arguments: {} } });
    ok('anonymous prompts/get of a per-caller prompt → unknown prompt', anonNote.json?.error?.code === -32602);
  });

  it('Fallback instructions (§12.3) — factual, no threats, resources only when exposed', async () => {
    await setConstant('MCP_CONFIG', JSON.stringify({ instructions_partial: 'mcp/no_such_instructions' }));
    const init = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    const text = init.json?.result?.instructions || '';
    ok('fallback instructions are served', text.length > 0, text);
    ok('fallback says calls act as the connected person', /acts as the person who connected you/.test(text), text);
    ok('fallback has no threat and no authority claim', !/suspend your access|authoritative|Call tools\/list/i.test(text), text);
    ok('fallback does not mention resources when none are exposed', !/resources\/list/.test(text), text);
    await setConstant('MCP_CONFIG', JSON.stringify({ instructions_partial: 'mcp/no_such_instructions', resources: { expose_markdown_pages: true, markdown_page_prefixes: ['docs'] } }));
    const withDocs = (await rpc({ jsonrpc: '2.0', id: 2, method: 'initialize', params: {} })).json?.result?.instructions || '';
    ok('fallback mentions documentation when pages are exposed', /resources\/list/.test(withDocs), withDocs);
    await unsetConstant('MCP_CONFIG');
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
      codes.push(r.json?.error?.code ?? r.status);
    }
    ok('first 3 pass, then -32004', codes.slice(0, 3).every(c => c === 200) && codes.slice(3).some(c => c === -32004), codes.join(','));
    const limited = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'search_events', arguments: { query: 'x' } } }, { token: RAW_TOKEN });
    ok('rate limit answers HTTP 200 with -32004', limited.status === 200 && limited.json?.error?.code === -32004, `status=${limited.status} code=${limited.json?.error?.code}`);
    ok('rate limit carries Retry-After (header and error.data)', !!limited.headers.get('retry-after') && Number.isInteger(limited.json?.error?.data?.retryAfter));
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

// ── Protocol eras: legacy 2025-06-18 and modern 2026-07-28 ──────────────────────────
// The server is dual-era. LEGACY: `initialize`, then requests with at most the
// MCP-Protocol-Version header; a version-less request is legacy and unchanged. MODERN:
// every request declares its revision in params._meta and mirrors it in headers
// (2026-07-28 basic/versioning, transports/streamable-http). These assert both eras and
// every modern rule: version errors, standard request headers, server/discover,
// resultType, cache hints and the methods that no longer exist.
describe('conformance · protocol eras (2025-06-18 legacy, 2026-07-28 modern)', () => {
  const modern = makeModern(base);
  const send = modern.send;

  afterEach(async () => { try { await unsetConstant('MCP_CONFIG'); } catch {} });
  afterAll(async () => { await unsetConstant('MCP_CONFIG'); await pruneRate(); });

  it('legacy era — initialize handshake and version-less requests are unchanged', async () => {
    const none = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    ok('initialize without a version → 2025-06-18', none.json?.result?.protocolVersion === '2025-06-18', none.json?.result?.protocolVersion);
    ok('initialize lists every supported revision in _meta', JSON.stringify(none.json?.result?._meta?.supportedProtocolVersions) === JSON.stringify(['2026-07-28', '2025-06-18']));
    ok('initialize advertises no Tasks extension', none.json?.result?.capabilities?.['io.modelcontextprotocol/tasks'] === undefined && none.json?.result?.capabilities?.extensions === undefined);
    ok('legacy results carry no resultType', none.json?.result?.resultType === undefined);

    const asks26 = await rpc({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '2026-07-28' } });
    ok('initialize asking for 2026-07-28 → 2025-06-18 (a handshake only selects a legacy revision)', asks26.json?.result?.protocolVersion === '2025-06-18', asks26.json?.result?.protocolVersion);
    const asksOld = await rpc({ jsonrpc: '2.0', id: 3, method: 'initialize', params: { protocolVersion: '1999-01-01' } });
    ok('initialize asking for an unknown revision → 2025-06-18', asksOld.json?.result?.protocolVersion === '2025-06-18');
    const modernInit = await send('initialize', { protocolVersion: '2025-06-18' });
    ok('initialize carrying modern _meta still gets the legacy handshake', modernInit.status === 200 && modernInit.json?.result?.protocolVersion === '2025-06-18', `status=${modernInit.status}`);

    const tl = await rpc({ jsonrpc: '2.0', id: 4, method: 'tools/list', params: {} });
    ok('version-less tools/list → no ttlMs, cacheScope or resultType', tl.status === 200 && tl.json?.result?.ttlMs === undefined && tl.json?.result?.cacheScope === undefined && tl.json?.result?.resultType === undefined);
    const hdr25 = await rpcH({ jsonrpc: '2.0', id: 5, method: 'tools/list', params: {} }, { 'MCP-Protocol-Version': '2025-06-18' });
    ok('MCP-Protocol-Version 2025-06-18 header → served as legacy', hdr25.status === 200 && Array.isArray(hdr25.json?.result?.tools) && hdr25.json?.result?.resultType === undefined);
    const ping = await rpc({ jsonrpc: '2.0', id: 6, method: 'ping' });
    ok('legacy ping → empty result', ping.status === 200 && ping.json?.result && Object.keys(ping.json.result).length === 0);
    const disc = await rpc({ jsonrpc: '2.0', id: 7, method: 'server/discover', params: {} });
    ok('server/discover is not a legacy method → 200 -32601', disc.status === 200 && disc.json?.error?.code === -32601, `status=${disc.status} code=${disc.json?.error?.code}`);
    const tasks = await rpc({ jsonrpc: '2.0', id: 8, method: 'tasks/get', params: { taskId: 'x' } });
    ok('tasks/get is not a legacy method → -32601', tasks.json?.error?.code === -32601);
    const rr = await rpc({ jsonrpc: '2.0', id: 9, method: 'resources/read', params: { uri: 'mcp+page:///no-such-page' } });
    ok('legacy unknown resource keeps -32002', rr.json?.error?.code === -32002, 'code=' + rr.json?.error?.code);
  });

  it('legacy header-only versions — unknown → -32022, modern without _meta → -32020', async () => {
    const unknown = await rpcH({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }, { 'MCP-Protocol-Version': '1999-01-01' });
    ok('unknown MCP-Protocol-Version header → 400 -32022', unknown.status === 400 && unknown.json?.error?.code === -32022, `status=${unknown.status} code=${unknown.json?.error?.code}`);
    ok('-32022 data names the request and the legacy revisions', unknown.json?.error?.data?.requested === '1999-01-01' && JSON.stringify(unknown.json?.error?.data?.supported) === JSON.stringify(['2025-06-18']), JSON.stringify(unknown.json?.error?.data));
    const noMeta = await send('tools/list', {}, { omitMeta: true });
    ok('2026-07-28 header without the _meta version → 400 -32020', noMeta.status === 400 && noMeta.json?.error?.code === -32020, `status=${noMeta.status} code=${noMeta.json?.error?.code}`);
  });

  it('modern versions — header required and matching, unsupported → -32022', async () => {
    const noHeader = await send('tools/list', {}, { omitHeaders: ['MCP-Protocol-Version'] });
    ok('_meta version without the MCP-Protocol-Version header → 400 -32020', noHeader.status === 400 && noHeader.json?.error?.code === -32020, `status=${noHeader.status} code=${noHeader.json?.error?.code}`);
    const mismatch = await send('tools/list', {}, { headers: { 'MCP-Protocol-Version': '2025-06-18' } });
    ok('header and _meta disagree → 400 -32020', mismatch.status === 400 && mismatch.json?.error?.code === -32020, `status=${mismatch.status} code=${mismatch.json?.error?.code}`);
    const future = await send('tools/list', {}, { version: '2099-01-01' });
    ok('unsupported modern revision → 400 -32022', future.status === 400 && future.json?.error?.code === -32022, `status=${future.status} code=${future.json?.error?.code}`);
    ok('-32022 data lists the modern revisions and echoes the request', JSON.stringify(future.json?.error?.data?.supported) === JSON.stringify(['2026-07-28']) && future.json?.error?.data?.requested === '2099-01-01', JSON.stringify(future.json?.error?.data));
    const legacyInMeta = await send('tools/list', {}, { version: '2025-06-18' });
    ok('a legacy revision declared per request → 400 -32022', legacyInMeta.status === 400 && legacyInMeta.json?.error?.code === -32022, `status=${legacyInMeta.status} code=${legacyInMeta.json?.error?.code}`);
    ok('error responses echo the request id', future.json?.id !== undefined && future.json?.jsonrpc === '2.0');
  });

  it('server/discover — revisions, capabilities, instructions, cache hint, server identity', async () => {
    const d = await send('server/discover');
    const r = d.json?.result || {};
    ok('server/discover → 200', d.status === 200, `status=${d.status} ${d.text.slice(0, 120)}`);
    ok('resultType complete', r.resultType === 'complete');
    ok('supportedVersions lists the modern revisions', JSON.stringify(r.supportedVersions) === JSON.stringify(['2026-07-28']), JSON.stringify(r.supportedVersions));
    ok('capabilities: tools, resources, prompts', !!r.capabilities?.tools && !!r.capabilities?.resources && !!r.capabilities?.prompts);
    ok('advertises the Tasks extension under capabilities.extensions', JSON.stringify(r.capabilities?.extensions) === JSON.stringify({ 'io.modelcontextprotocol/tasks': {} }), JSON.stringify(r.capabilities?.extensions));
    ok('no deprecated logging capability', r.capabilities?.logging === undefined);
    ok('instructions present', typeof r.instructions === 'string' && r.instructions.length > 0);
    ok('ttlMs + cacheScope public', typeof r.ttlMs === 'number' && r.ttlMs >= 0 && r.cacheScope === 'public', `ttlMs=${r.ttlMs} scope=${r.cacheScope}`);
    ok('serverInfo in _meta', typeof r._meta?.['io.modelcontextprotocol/serverInfo']?.name === 'string' && typeof r._meta?.['io.modelcontextprotocol/serverInfo']?.version === 'string');
  });

  it('modern credentials — an invalid bearer is 401 on discovery; prompts vary by caller', async () => {
    for (const m of ['server/discover', 'tools/list', 'prompts/list']) {
      const r = await send(m, {}, { token: 'wrong' });
      ok(`bad token on ${m} → 401 invalid_token`, r.status === 401 && /error="invalid_token"/.test(r.headers.get('www-authenticate') || ''), `status=${r.status}`);
    }
    const anon = await send('prompts/list');
    ok('anonymous prompts/list → cacheScope public', anon.json?.result?.cacheScope === 'public', `scope=${anon.json?.result?.cacheScope}`);
    const authed = await send('prompts/list', {}, { token: RAW_TOKEN });
    ok('signed-in prompts/list → cacheScope private (the list depends on the caller)', authed.json?.result?.cacheScope === 'private', `scope=${authed.json?.result?.cacheScope}`);
  });

  it('modern results — resultType on every result, spec cache scopes', async () => {
    const tl = await send('tools/list');
    ok('tools/list → resultType complete', tl.json?.result?.resultType === 'complete', tl.text.slice(0, 120));
    ok('open tools/list → ttlMs + cacheScope public', typeof tl.json?.result?.ttlMs === 'number' && tl.json?.result?.cacheScope === 'public', `scope=${tl.json?.result?.cacheScope}`);
    for (const m of ['prompts/list', 'resources/list', 'resources/templates/list']) {
      const r = await send(m);
      ok(`${m} → resultType complete + ttlMs + cacheScope public`, r.status === 200 && r.json?.result?.resultType === 'complete' && typeof r.json?.result?.ttlMs === 'number' && r.json?.result?.cacheScope === 'public', `${r.status} ${r.text.slice(0, 120)}`);
    }

    await setConstant('MCP_CONFIG', JSON.stringify({ tools_list_scope: 'principal' }));
    const scoped = await send('tools/list', {}, { token: RAW_TOKEN });
    ok('principal-scoped tools/list → cacheScope private', scoped.json?.result?.cacheScope === 'private', `scope=${scoped.json?.result?.cacheScope}`);
    await unsetConstant('MCP_CONFIG');

    const call = await send('tools/call', { name: 'search_events', arguments: { query: CONF_KEYWORD } }, { token: RAW_TOKEN });
    ok('tools/call → result with resultType complete', call.status === 200 && call.json?.result?.resultType === 'complete' && call.json?.result?.isError === false, `${call.status} ${call.text.slice(0, 160)}`);
    const legacyCall = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_events', arguments: { query: CONF_KEYWORD } } }, { token: RAW_TOKEN });
    ok('legacy tools/call → no resultType', legacyCall.json?.result && legacyCall.json.result.resultType === undefined);

    const rr = await send('resources/read', { uri: 'mcp+page:///no-such-page' });
    ok('modern unknown resource → -32602 (2026-07-28 retired -32002)', rr.json?.error?.code === -32602, 'code=' + rr.json?.error?.code);
  });

  it('modern methods — removed or unknown methods answer 404 -32601', async () => {
    for (const m of ['ping', 'logging/setLevel', 'completion/complete', 'no/such-method']) {
      const r = await send(m, m === 'logging/setLevel' ? { level: 'info' } : {});
      ok(`${m} → 404 -32601`, r.status === 404 && r.json?.error?.code === -32601, `status=${r.status} code=${r.json?.error?.code}`);
    }
    const note = await send('notifications/cancelled', { requestId: 1 });
    ok('a notification → 202, no body', note.status === 202 && note.text === '', `status=${note.status}`);
  });

  it('modern request headers — Mcp-Method and Mcp-Name required and matching', async () => {
    const noMethod = await send('tools/list', {}, { omitHeaders: ['Mcp-Method'] });
    ok('missing Mcp-Method → 400 -32020', noMethod.status === 400 && noMethod.json?.error?.code === -32020, `status=${noMethod.status} code=${noMethod.json?.error?.code}`);
    const wrongMethod = await send('tools/list', {}, { headers: { 'Mcp-Method': 'prompts/list' } });
    ok('Mcp-Method disagrees with the body → 400 -32020', wrongMethod.status === 400 && wrongMethod.json?.error?.code === -32020);

    const args = { name: 'search_events', arguments: { query: CONF_KEYWORD } };
    const noName = await send('tools/call', args, { token: RAW_TOKEN, omitHeaders: ['Mcp-Name'] });
    ok('tools/call without Mcp-Name → 400 -32020', noName.status === 400 && noName.json?.error?.code === -32020, `status=${noName.status} code=${noName.json?.error?.code}`);
    const wrongName = await send('tools/call', args, { token: RAW_TOKEN, headers: { 'Mcp-Name': 'a_different_tool' } });
    ok('Mcp-Name disagrees with the tool name → 400 -32020', wrongName.status === 400 && wrongName.json?.error?.code === -32020);
    const encoded = await send('tools/call', args, { token: RAW_TOKEN, headers: { 'Mcp-Name': '=?base64?' + Buffer.from('search_events').toString('base64') + '?=' } });
    ok('Base64-encoded Mcp-Name is decoded before the comparison', encoded.status === 200 && encoded.json?.result?.isError === false, `${encoded.status} ${encoded.text.slice(0, 120)}`);
    const malformed = await send('tools/call', args, { token: RAW_TOKEN, headers: { 'Mcp-Name': '=?base64?###?=' } });
    ok('malformed Base64 in Mcp-Name → 400 -32020', malformed.status === 400 && malformed.json?.error?.code === -32020, `status=${malformed.status}`);
    const unpadded = await send('tools/call', args, { token: RAW_TOKEN, headers: { 'Mcp-Name': '=?base64?YQ?=' } });
    ok('unpadded Base64 in Mcp-Name → 400 -32020', unpadded.status === 400 && unpadded.json?.error?.code === -32020, `status=${unpadded.status}`);

    const unicode = await send('prompts/get', { name: 'zażółć_prompt', arguments: {} });
    ok('a non-ASCII prompt name travels Base64-encoded and passes the header check', unicode.json?.error?.code !== -32020 && unicode.status !== 500, `status=${unicode.status} code=${unicode.json?.error?.code}`);
    const promptWrong = await send('prompts/get', { name: 'one', arguments: {} }, { headers: { 'Mcp-Name': 'two' } });
    ok('prompts/get Mcp-Name mismatch → 400 -32020', promptWrong.status === 400 && promptWrong.json?.error?.code === -32020);
    const resNoName = await send('resources/read', { uri: 'mcp+page:///docs/x' }, { omitHeaders: ['Mcp-Name'] });
    ok('resources/read without Mcp-Name → 400 -32020', resNoName.status === 400 && resNoName.json?.error?.code === -32020);
    const resWrong = await send('resources/read', { uri: 'mcp+page:///docs/x' }, { headers: { 'Mcp-Name': 'mcp+page:///docs/y' } });
    ok('resources/read Mcp-Name disagrees with the uri → 400 -32020', resWrong.status === 400 && resWrong.json?.error?.code === -32020);
  });

  it('transport — GET and DELETE on /mcp answer 405 with Allow: POST', async () => {
    for (const m of ['GET', 'DELETE']) {
      const r = await fetch(modern.MCP, { method: m });
      ok(`${m} /mcp → 405`, r.status === 405, 'status=' + r.status);
      ok(`${m} /mcp → Allow: POST`, r.headers.get('allow') === 'POST', String(r.headers.get('allow')));
    }
  });

  it('connect-time OAuth challenge (opt-in) covers initialize and server/discover', async () => {
    const openDisc = await send('server/discover');
    ok('challenge off (default) → server/discover open', openDisc.status === 200);
    await setConstant('MCP_CONFIG', JSON.stringify({ oauth: { challenge_initialize: true } }));
    const init = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    ok('challenge on → initialize without a bearer → 401 + WWW-Authenticate', init.status === 401 && /resource_metadata=/.test(init.headers.get('www-authenticate') || ''), `status=${init.status}`);
    const disc = await send('server/discover');
    ok('challenge on → server/discover without a bearer → 401 + WWW-Authenticate', disc.status === 401 && /resource_metadata=/.test(disc.headers.get('www-authenticate') || ''), `status=${disc.status}`);
    const discAuthed = await send('server/discover', {}, { token: RAW_TOKEN });
    ok('challenge on → server/discover with a bearer → 200', discAuthed.status === 200 && discAuthed.json?.result?.resultType === 'complete', `status=${discAuthed.status}`);
    const list = await send('tools/list');
    ok('challenge on → other discovery stays open (tools/list 200)', list.status === 200);
    await unsetConstant('MCP_CONFIG');
  });

  it('legacy header routing — Mcp-Method / Mcp-Name reconciliation unchanged', async () => {
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
