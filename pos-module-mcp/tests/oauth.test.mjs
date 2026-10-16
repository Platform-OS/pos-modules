/**
 * pos-module-mcp — built-in OAuth 2.1 authorization server suite, Vitest.
 *
 * Drives the whole client journey over real HTTP against a deployed instance:
 * discovery (RFC 8414 + RFC 9728) → Dynamic Client Registration (RFC 7591) →
 * /oauth/authorize (sign-in, consent, PKCE S256, state + iss) → /oauth/token
 * (authorization_code, refresh_token rotation + reuse detection) → using the access
 * token on /mcp (expiry, audience, scope step-up) → /oauth/revoke (RFC 7009). Code and
 * token rows are inspected / aged through admin GraphQL (only digests are stored, so
 * the suite looks rows up by sha256 of the raw value, exactly as the server does).
 *
 * Users: the deterministic seed fixtures — member (mcp_user) consents, outsider (no
 * role) is refused, validator (mcp_user) has its role pulled mid-grant. Each user gets
 * its own browser cookie jar (makeWeb), signed in once.
 *
 * MUST run serially / single-instance (see vitest.config.mjs). NON-DESTRUCTIVE: enables
 * MCP_ENABLE_TEST_TOOLS + a raised OAuth rate limit (MCP_CONFIG) for the run, deletes
 * every client / code / token / test_note row it created and the oauth_* per-IP rate
 * counters, restores the fixtures (applyReset) and unsets both constants in afterAll.
 *
 * Run: npx vitest run tests/oauth.test.mjs
 * Env: MCP_URL, MCP_TOKEN (instance admin api token) — falls back to the repo .pos "ps".
 */
import { describe, it, beforeAll, afterAll, afterEach, expect } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { loadEnv, makeAdmin, pruneRate } from './fixtures.mjs';
import { makeMcp, makeConstants, makeWeb } from './lib/harness.mjs';
import { FIXT, applyReset } from './seed/seed.mjs';

const { base, admin } = loadEnv();
const adm = makeAdmin({ base, admin });
const { callTool, isOkResult } = makeMcp(base);
const { setConstant, unsetConstant } = makeConstants(adm);

// The server derives every absolute URL from the request origin (queries/origin): the
// issuer, the endpoints and the RFC 8707 resource (= <origin>/mcp).
const ORIGIN = base.replace(/\/+$/, '');
const RESOURCE = ORIGIN + '/mcp';

const T_TOKEN = 'modules/mcp/mcp_token';
const T_CODE = 'modules/mcp/mcp_oauth_code';
const T_CLIENT = 'modules/mcp/mcp_oauth_client';
const T_RATE = 'modules/mcp/mcp_rate_counter';
const T_PROFILE = 'modules/user/profile';
const T_NOTE = 'test_note';

// Redirect URIs of the clients this suite registers. Never followed (redirect:'manual')
// — only the Location header is parsed — so the hosts need not exist.
const REDIRECT_A = 'https://client-a.example.test/cb';
const REDIRECT_B1 = 'https://client-b.example.test/one';
const REDIRECT_B2 = 'https://client-b.example.test/two';
const REDIRECT_C = 'https://client-c.example.test/cb';

// The Client ID Metadata Document the test instance serves itself
// (app/views/pages/test/mcp-client-metadata.json.liquid); these values match it. The name
// stays under the 40 characters a grant label keeps (commands/oauth/issue_tokens).
const CIMD_CLIENT_ID = ORIGIN + '/test/mcp-client-metadata.json';
const CIMD_REDIRECT = 'https://client-cimd.example.test/cb';
const CIMD_NAME = 'CIMD "q" &quot;e&quot; &amp; &lt;b&gt;';

// Baseline MCP_CONFIG for the run: the per-IP OAuth limits (60/min token + authorize,
// 10/min registration) are lifted so this suite's own traffic never trips them; the
// rate-limit test lowers registration explicitly.
const BASE_OAUTH = { token_rate_limit_per_min: 1000, registration_rate_limit_per_min: 1000 };
const setOauthConfig = (extra = {}) => setConstant('MCP_CONFIG', JSON.stringify({ oauth: { ...BASE_OAUTH, ...extra } }));

const ok = (name, cond, detail) => expect.soft(cond === true || cond === false ? cond : !!cond, detail ? `${name} — ${detail}` : name).toBe(true);

// ---- PKCE (RFC 7636, S256) ---------------------------------------------------
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sha256hex = (s) => createHash('sha256').update(s).digest('hex');
function pkce() {
  const verifier = b64url(randomBytes(32)); // 43 unreserved chars
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}
const newState = () => 'st_' + randomBytes(8).toString('hex');

// ---- machine endpoints (no cookies) ------------------------------------------
async function postForm(path, fields) {
  const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, headers: res.headers, json, text };
}
async function postJson(path, body) {
  const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, headers: res.headers, json, text };
}
async function getJson(path) {
  const res = await fetch(base + path);
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, headers: res.headers, json, text };
}
const token = (fields) => postForm('oauth/token', fields);
const revoke = (fields) => postForm('oauth/revoke', fields);

// Every client this run registered → deleted (with its codes + tokens) in afterAll.
const createdClients = new Set();
async function register(meta) {
  const r = await postJson('oauth/register', meta);
  if (r.json?.client_id) createdClients.add(r.json.client_id);
  return r;
}

// ---- /oauth/authorize (browser) ----------------------------------------------
/**
 * GET /oauth/authorize in `web`'s cookie jar. `p` overrides the defaults (a valid
 * request for client A); a key set to undefined is left out of the query.
 * @returns { status, location, loc (URL|null), html }
 */
async function authorizeGet(web, p = {}) {
  const q = { response_type: 'code', client_id: clientA, redirect_uri: REDIRECT_A, state: newState(), code_challenge: pkce().challenge, code_challenge_method: 'S256', ...p };
  for (const k of Object.keys(q)) if (q[k] === undefined) delete q[k];
  const res = await web.get('oauth/authorize?' + new URLSearchParams(q).toString());
  const location = res.headers.get('location');
  let loc = null; try { loc = location ? new URL(location, base) : null; } catch {}
  return { status: res.status, headers: res.headers, location, loc, html: await res.text() };
}
const ridOf = (html) => (html.match(/name="rid"\s+value="([^"]*)"/) || [])[1];

/** Submit the consent form of an already-fetched consent page. → { status, location, loc } */
async function decide(web, html, decision) {
  const res = await web.post('oauth/authorize', { authenticity_token: web.formTok(html), rid: ridOf(html), decision });
  const location = res.headers.get('location');
  let loc = null; try { loc = location ? new URL(location, base) : null; } catch {}
  return { status: res.status, location, loc };
}

/**
 * Full front-channel: authorize → consent → approve. Returns the code plus everything
 * the token request needs. opts: { web, clientId, redirectUri (null = omit), scope,
 * resource, state }.
 */
async function getCode(opts = {}) {
  const web = opts.web || webMember;
  const { verifier, challenge } = pkce();
  const state = opts.state || newState();
  const redirectUri = opts.redirectUri === undefined ? REDIRECT_A : opts.redirectUri;
  const a = await authorizeGet(web, {
    client_id: opts.clientId || clientA, redirect_uri: redirectUri ?? undefined,
    code_challenge: challenge, state, scope: opts.scope, resource: opts.resource,
  });
  const d = a.status === 200 ? await decide(web, a.html, 'approve') : { status: a.status, loc: a.loc };
  return { code: d.loc?.searchParams.get('code') || null, verifier, challenge, state, loc: d.loc, consent: a };
}

/** Code → token pair (the happy path). Returns the token endpoint response. */
async function mintTokens(opts = {}) {
  const c = await getCode(opts);
  const fields = { grant_type: 'authorization_code', code: c.code || '', code_verifier: c.verifier, client_id: opts.clientId || clientA };
  const ru = opts.redirectUri === undefined ? REDIRECT_A : opts.redirectUri;
  if (ru) fields.redirect_uri = ru;
  return token(fields);
}

// ---- admin GraphQL row access (digests only) ---------------------------------
async function tokenRowByAccess(raw) {
  const r = await adm.gql(`{ records(per_page: 1, filter: { table: { value: "${T_TOKEN}" } properties: [{ name: "token_digest", value: "${sha256hex(raw)}" }] }) { results { id status: property(name: "status") kind: property(name: "kind") client_id: property(name: "client_id") scope: property(name: "scope") resource: property(name: "resource") user_id: property(name: "user_id") } } }`);
  return r?.data?.records?.results?.[0] || null;
}
async function codeRow(raw) {
  const r = await adm.gql(`{ records(per_page: 1, filter: { table: { value: "${T_CODE}" } properties: [{ name: "code_digest", value: "${sha256hex(raw)}" }] }) { results { id status: property(name: "status") redirect_uri_sent: property_boolean(name: "redirect_uri_sent") } } }`);
  return r?.data?.records?.results?.[0] || null;
}
async function setProps(table, id, props) {
  const p = Object.entries(props).map(([k, v]) => typeof v === 'number' ? `{ name: "${k}", value_int: ${v} }` : `{ name: "${k}", value: ${JSON.stringify(String(v))} }`).join(' ');
  const r = await adm.gql(`mutation { record_update(id: ${id}, record: { table: "${table}" properties: [ ${p} ] }) { id } }`);
  if (r?.errors) throw new Error('record_update failed: ' + JSON.stringify(r.errors));
}
const setRoles = (profileId, roles) => adm.gql(`mutation { record_update(id: ${profileId}, record: { table: "${T_PROFILE}" properties: [{ name: "roles", value_array: ${JSON.stringify(roles)} }] }) { id } }`);
async function deleteWhere(table, prop, value) {
  const r = await adm.gql(`{ records(per_page: 200, filter: { table: { value: "${table}" } properties: [{ name: "${prop}", value: ${JSON.stringify(value)} }] }) { results { id } } }`);
  for (const row of r?.data?.records?.results || []) { try { await adm.recordDelete(table, row.id); } catch {} }
}
// Per-IP OAuth limiter rows ("oauth_token_ip:…", "oauth_authorize_ip:…", "oauth_register_ip:…").
async function pruneOauthRate() {
  const r = await adm.gql(`{ records(per_page: 200, filter: { table: { value: "${T_RATE}" } properties: [{ name: "key", starts_with: "oauth_" }] }) { results { id } } }`);
  for (const row of r?.data?.records?.results || []) { try { await adm.recordDelete(T_RATE, row.id); } catch {} }
}

// /mcp helpers. 401/403 carry the RFC 6750 challenge in WWW-Authenticate.
const www = (r) => r.headers.get('www-authenticate') || '';
const isInvalidToken401 = (r) => r.status === 401 && r.json?.error?.code === -32001 && /error="invalid_token"/.test(www(r));
const tokenErr = (r, error) => r.status === 400 && r.json?.error === error;

// ---- fixtures (resolved in beforeAll) ----------------------------------------
let mem, out, val;
let webMember, webOutsider, webValidator;
let clientA, clientB, clientC;

describe('oauth · built-in OAuth 2.1 authorization server', () => {
  beforeAll(async () => {
    await setConstant('MCP_ENABLE_TEST_TOOLS', 'true');
    await setOauthConfig();
    await applyReset(adm.gql);
    await pruneOauthRate();
    mem = FIXT.users.member; out = FIXT.users.outsider; val = FIXT.users.validator;
    for (const h of [mem, val]) await pruneRate(adm, h.principal); // per-principal /mcp window

    // Three DCR clients: A (one redirect — may omit redirect_uri), B (two redirects —
    // must always send one), C (a second, unrelated client for cross-client checks).
    clientA = (await register({ client_name: 'CI OAuth A', redirect_uris: [REDIRECT_A] })).json?.client_id;
    clientB = (await register({ client_name: 'CI OAuth B', redirect_uris: [REDIRECT_B1, REDIRECT_B2] })).json?.client_id;
    clientC = (await register({ client_name: 'CI OAuth C', redirect_uris: [REDIRECT_C] })).json?.client_id;
    if (!clientA || !clientB || !clientC) throw new Error('DCR setup failed — is the built-in AS enabled?');

    webMember = makeWeb(base); webOutsider = makeWeb(base); webValidator = makeWeb(base);
    if (!(await webMember.sessionLogin(mem))) throw new Error('member sign-in failed');
    if (!(await webOutsider.sessionLogin(out))) throw new Error('outsider sign-in failed');
    if (!(await webValidator.sessionLogin(val))) throw new Error('validator sign-in failed');
  });

  afterAll(async () => {
    // Everything keyed by the clients we registered: tokens (grants), codes, the clients.
    for (const cid of createdClients) {
      try { await deleteWhere(T_TOKEN, 'client_id', cid); } catch {}
      try { await deleteWhere(T_CODE, 'client_id', cid); } catch {}
      try { await deleteWhere(T_CLIENT, 'client_id', cid); } catch {}
    }
    // test_write rows written through OAuth tokens (only this suite writes source=test_write
    // with an "oauth-" label for the member).
    try {
      const r = await adm.gql(`{ records(per_page: 100, filter: { table: { value: "${T_NOTE}" } properties: [{ name: "user_id", value: "${mem.userId}" }] }) { results { id label: property(name: "label") } } }`);
      for (const row of r?.data?.records?.results || []) if (String(row.label || '').startsWith('oauth-')) await adm.recordDelete(T_NOTE, row.id);
    } catch {}
    try { await pruneOauthRate(); } catch {}
    for (const h of [mem, out, val]) { if (h) { try { await pruneRate(adm, h.principal); } catch {} } }
    try { await applyReset(adm.gql); } catch {} // restores validator's role if a test died mid-way
    await unsetConstant('MCP_CONFIG');
    await unsetConstant('MCP_ENABLE_TEST_TOOLS');
  });

  // Guard: a test that changed MCP_CONFIG (rate-limit test) never leaks it to the next.
  afterEach(async () => { try { await setOauthConfig(); } catch {} });

  // ==== Discovery ==============================================================

  it('Discovery — authorization server metadata (RFC 8414)', async () => {
    const r = await getJson('.well-known/oauth-authorization-server');
    const m = r.json || {};
    ok('200 JSON', r.status === 200 && !!r.json, 'status=' + r.status);
    ok('issuer = the instance origin (no path, no trailing slash)', m.issuer === ORIGIN, String(m.issuer));
    ok('authorization_endpoint', m.authorization_endpoint === ORIGIN + '/oauth/authorize', m.authorization_endpoint);
    ok('token_endpoint', m.token_endpoint === ORIGIN + '/oauth/token', m.token_endpoint);
    ok('revocation_endpoint', m.revocation_endpoint === ORIGIN + '/oauth/revoke', m.revocation_endpoint);
    ok('registration_endpoint (DCR on by default)', m.registration_endpoint === ORIGIN + '/oauth/register', m.registration_endpoint);
    ok('PKCE: S256 only', JSON.stringify(m.code_challenge_methods_supported) === '["S256"]', JSON.stringify(m.code_challenge_methods_supported));
    ok('response_types: code only', JSON.stringify(m.response_types_supported) === '["code"]');
    ok('grant_types: authorization_code + refresh_token', JSON.stringify([...(m.grant_types_supported || [])].sort()) === '["authorization_code","refresh_token"]', JSON.stringify(m.grant_types_supported));
    ok('public clients only (auth method none)', JSON.stringify(m.token_endpoint_auth_methods_supported) === '["none"]');
    ok('scopes mcp:read + mcp:write', Array.isArray(m.scopes_supported) && m.scopes_supported.includes('mcp:read') && m.scopes_supported.includes('mcp:write'));
    ok('RFC 9207 iss parameter advertised', m.authorization_response_iss_parameter_supported === true);
    ok('CIMD advertised', m.client_id_metadata_document_supported === true);
    ok('readable cross-origin (CORS *)', r.headers.get('access-control-allow-origin') === '*');
  });

  it('Config — the retired MCP_OAUTH_ISSUER constant keeps the built-in server off (fail closed)', async () => {
    try {
      await setConstant('MCP_OAUTH_ISSUER', 'https://issuer.example.test');
      const meta = await getJson('.well-known/oauth-authorization-server');
      ok('authorization server metadata → 404 while the constant is set', meta.status === 404, 'status=' + meta.status);
      const prm = await getJson('.well-known/oauth-protected-resource');
      ok('protected resource metadata advertises no authorization server', prm.json && prm.json.authorization_servers === undefined, JSON.stringify(prm.json).slice(0, 160));
      const t = await token({ grant_type: 'authorization_code', code: 'x', client_id: clientA });
      ok('token endpoint refuses to mint', !t.json?.access_token && t.status >= 400, 'status=' + t.status);
    } finally {
      await unsetConstant('MCP_OAUTH_ISSUER');
    }
    const back = await getJson('.well-known/oauth-authorization-server');
    ok('constant removed → the built-in server is back', back.status === 200, 'status=' + back.status);
  });

  it('Discovery — protected resource metadata (RFC 9728) + the /mcp 401 challenge points at it', async () => {
    for (const path of ['.well-known/oauth-protected-resource', '.well-known/oauth-protected-resource/mcp']) {
      const r = await getJson(path);
      const d = r.json || {};
      ok(`${path} → 200`, r.status === 200, 'status=' + r.status);
      ok(`${path}: resource = <origin>/mcp`, d.resource === RESOURCE, String(d.resource));
      ok(`${path}: authorization_servers = [issuer]`, Array.isArray(d.authorization_servers) && d.authorization_servers.includes(ORIGIN), JSON.stringify(d.authorization_servers));
      ok(`${path}: bearer via header only`, JSON.stringify(d.bearer_methods_supported) === '["header"]');
      ok(`${path}: scopes_supported`, Array.isArray(d.scopes_supported) && d.scopes_supported.includes('mcp:write'));
    }
    const anon = await callTool(null, 'test_public', {});
    ok('/mcp without a bearer → 401 + resource_metadata link', anon.status === 401 && www(anon).includes(`resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource"`), www(anon));
  });

  // ==== Dynamic Client Registration ============================================

  it('DCR — a valid registration returns a public client (RFC 7591)', async () => {
    const r = await register({ client_name: '<b>CI</b> OAuth valid', redirect_uris: [REDIRECT_C, 'http://127.0.0.1:33418/callback', 'cursor://anysphere.cursor-retrieval/oauth/callback'], token_endpoint_auth_method: 'client_secret_basic' });
    const b = r.json || {};
    ok('201 Created', r.status === 201, 'status=' + r.status + ' ' + r.text.slice(0, 160));
    ok('client_id issued (mcp_client_…)', /^mcp_client_[0-9a-f]{32}$/.test(b.client_id || ''), b.client_id);
    ok('token_endpoint_auth_method forced to none (no secret)', b.token_endpoint_auth_method === 'none' && b.client_secret === undefined);
    ok('grant_types + response_types as registered', JSON.stringify(b.grant_types) === '["authorization_code","refresh_token"]' && JSON.stringify(b.response_types) === '["code"]');
    ok('redirect_uris echoed (https, loopback http, private-use scheme)', Array.isArray(b.redirect_uris) && b.redirect_uris.length === 3);
    ok('client_name has its markup stripped', b.client_name === 'CI OAuth valid', String(b.client_name));
    ok('client_id_issued_at is unix seconds', Number.isInteger(b.client_id_issued_at) && Math.abs(b.client_id_issued_at - Date.now() / 1000) < 3600);
  });

  it('DCR — unsafe redirect URIs are rejected with invalid_redirect_uri', async () => {
    const bad = {
      'javascript: URI': 'javascript:alert(1)',
      'javascript:// URI': 'javascript://x/%0aalert(1)',
      'data: URI': 'data://text/html,<script>alert(1)</script>',
      'http on a non-loopback host': 'http://client.example.test/cb',
      'URI with a fragment': 'https://client.example.test/cb#frag',
      'URI with userinfo': 'https://user:pw@client.example.test/cb',
      'relative URI': '/cb',
    };
    for (const [name, uri] of Object.entries(bad)) {
      const r = await register({ client_name: 'CI bad', redirect_uris: [REDIRECT_A, uri] });
      ok(`${name} → 400 invalid_redirect_uri`, tokenErr(r, 'invalid_redirect_uri'), `${uri} → ${r.status} ${r.text.slice(0, 120)}`);
    }
    ok('missing redirect_uris → invalid_redirect_uri', tokenErr(await register({ client_name: 'CI bad' }), 'invalid_redirect_uri'));
    ok('redirect_uris not an array → invalid_redirect_uri', tokenErr(await register({ redirect_uris: REDIRECT_A }), 'invalid_redirect_uri'));
    ok('empty redirect_uris → invalid_redirect_uri', tokenErr(await register({ redirect_uris: [] }), 'invalid_redirect_uri'));
    ok('unsupported grant type → invalid_client_metadata', tokenErr(await register({ redirect_uris: [REDIRECT_A], grant_types: ['client_credentials'] }), 'invalid_client_metadata'));
  });

  it('DCR — per-IP registration rate limit → 429 slow_down', async () => {
    await setOauthConfig({ registration_rate_limit_per_min: 3 });
    await pruneOauthRate();
    try {
      const codes = [];
      for (let i = 0; i < 5; i++) codes.push((await register({ client_name: 'CI rate ' + i, redirect_uris: [REDIRECT_A] })).status);
      // A minute boundary inside the loop resets the window; the limit still bites once
      // more than 3 land in one window, so assert the shape, not exact positions.
      ok('first registrations within the limit succeed', codes[0] === 201 && codes[1] === 201, codes.join(','));
      ok('over the limit → 429', codes.includes(429), codes.join(','));
      const last = await register({ client_name: 'CI rate last', redirect_uris: [REDIRECT_A] });
      ok('429 body is an OAuth error (slow_down)', last.status !== 429 || last.json?.error === 'slow_down', last.text.slice(0, 120));
    } finally {
      await setOauthConfig();
      await pruneOauthRate();
    }
  });

  // ==== /oauth/authorize =======================================================

  it('Authorize — anonymous user is sent to sign-in', async () => {
    const anon = makeWeb(base); // empty cookie jar
    const a = await authorizeGet(anon);
    ok('302 to /sessions/new', a.status === 302 && /\/sessions\/new/.test(a.location || ''), `status=${a.status} location=${a.location}`);
    ok('no code is handed out', !/[?&]code=/.test(a.location || ''));
  });

  it('Authorize — signed-in user without mcp.tokens.manage → access_denied on the client redirect', async () => {
    const state = newState();
    const a = await authorizeGet(webOutsider, { state });
    ok('302 back to the client redirect_uri', a.status === 302 && a.location?.startsWith(REDIRECT_A + '?'), `status=${a.status} location=${a.location}`);
    ok('error=access_denied', a.loc?.searchParams.get('error') === 'access_denied');
    ok('state echoed', a.loc?.searchParams.get('state') === state);
    ok('iss = issuer (RFC 9207)', a.loc?.searchParams.get('iss') === ORIGIN, a.loc?.searchParams.get('iss'));
    ok('no code', !a.loc?.searchParams.has('code'));
  });

  it('Authorize — consent approve returns code + state + iss; deny returns access_denied', async () => {
    const state = newState();
    const a = await authorizeGet(webMember, { state });
    ok('consent page 200', a.status === 200 && /Authorize/.test(a.html) && !!ridOf(a.html), 'status=' + a.status);
    ok('consent page cannot be framed', a.headers.get('x-frame-options') === 'DENY' && /frame-ancestors 'none'/.test(a.headers.get('content-security-policy') || ''));
    ok('consent page names the redirect host', a.html.includes('client-a.example.test'));
    const d = await decide(webMember, a.html, 'approve');
    ok('approve → 302 to the client redirect_uri', d.status === 302 && d.location?.startsWith(REDIRECT_A + '?'), `status=${d.status} location=${d.location}`);
    ok('code issued (mcp_ac_…)', /^mcp_ac_[0-9a-f]{64}$/.test(d.loc?.searchParams.get('code') || ''));
    ok('state echoed', d.loc?.searchParams.get('state') === state);
    ok('iss = issuer', d.loc?.searchParams.get('iss') === ORIGIN);
    const row = await codeRow(d.loc?.searchParams.get('code') || 'x');
    ok('only the code digest is stored, status issued, redirect_uri_sent recorded', row?.status === 'issued' && row?.redirect_uri_sent === true, JSON.stringify(row));

    // The parked request is consumed by the decision: replaying the same POST is refused.
    const replay = await decide(webMember, a.html, 'approve');
    ok('replayed consent POST → 400, no second code', replay.status === 400 && !replay.loc?.searchParams?.has('code'), 'status=' + replay.status);

    const state2 = newState();
    const a2 = await authorizeGet(webMember, { state: state2 });
    const deny = await decide(webMember, a2.html, 'deny');
    ok('deny → 302 with error=access_denied', deny.status === 302 && deny.loc?.searchParams.get('error') === 'access_denied', deny.location);
    ok('deny: state + iss present, no code', deny.loc?.searchParams.get('state') === state2 && deny.loc?.searchParams.get('iss') === ORIGIN && !deny.loc?.searchParams.has('code'));

    // CSRF: a consent POST without the session's authenticity_token carries no session,
    // so there is no parked request and no code. (A throwaway jar: a CSRF failure may
    // reset the session, and the member's jar is reused by every later test.)
    const webForge = makeWeb(base);
    ok('throwaway member session', await webForge.sessionLogin(mem));
    const a3 = await authorizeGet(webForge);
    const forged = await webForge.post('oauth/authorize', { authenticity_token: 'forged', rid: ridOf(a3.html), decision: 'approve' });
    ok('consent POST with a forged authenticity_token issues no code', !/[?&]code=/.test(forged.headers.get('location') || ''), `status=${forged.status} location=${forged.headers.get('location')}`);
  });

  // The parked request is stored as JSON in the session; platformOS parse_json decodes
  // HTML entities unless raw_text: true, so "&quot;" in state broke the decision page.
  it('Authorize — a state with HTML entities comes back unchanged', async () => {
    const state = 'st-&quot;x&quot;-&amp;-&lt;y&gt;-' + newState();
    const a = await authorizeGet(webMember, { state });
    ok('consent page 200', a.status === 200 && !!ridOf(a.html), 'status=' + a.status);
    const d = await decide(webMember, a.html, 'approve');
    ok('approve → 302 with a code', d.status === 302 && /^mcp_ac_[0-9a-f]{64}$/.test(d.loc?.searchParams.get('code') || ''), `status=${d.status} location=${d.location}`);
    ok('state echoed exactly', d.loc?.searchParams.get('state') === state, d.loc?.searchParams.get('state'));
  });

  it('Authorize — client / redirect_uri problems render an error page (never redirect)', async () => {
    const unknown = await authorizeGet(webMember, { client_id: 'mcp_client_' + '0'.repeat(32) });
    ok('unknown client_id → 400 page, no Location', unknown.status === 400 && !unknown.location && /Unknown client/.test(unknown.html), 'status=' + unknown.status);
    const unreg = await authorizeGet(webMember, { redirect_uri: 'https://attacker.example.test/cb' });
    ok('unregistered redirect_uri → 400 page, no Location', unreg.status === 400 && !unreg.location && /not registered/.test(unreg.html), 'status=' + unreg.status);
    const prefix = await authorizeGet(webMember, { redirect_uri: REDIRECT_A + '/../evil' });
    ok('redirect_uri must match exactly (no prefix match)', prefix.status === 400 && !prefix.location, 'status=' + prefix.status);
    const ambiguous = await authorizeGet(webMember, { client_id: clientB, redirect_uri: undefined });
    ok('client with 2 redirect_uris and none sent → 400 page', ambiguous.status === 400 && !ambiguous.location, 'status=' + ambiguous.status);
  });

  it('Authorize — PKCE / response_type / resource errors are redirected to the client', async () => {
    const redirErr = (a, error, re) => a.status === 302 && a.location?.startsWith(REDIRECT_A + '?') && a.loc?.searchParams.get('error') === error && (!re || re.test(a.loc?.searchParams.get('error_description') || '')) && !a.loc?.searchParams.has('code');
    const noPkce = await authorizeGet(webMember, { code_challenge: undefined, code_challenge_method: undefined });
    ok('PKCE missing → invalid_request', redirErr(noPkce, 'invalid_request', /code_challenge is required/), noPkce.location);
    const plain = await authorizeGet(webMember, { code_challenge: 'a'.repeat(43), code_challenge_method: 'plain' });
    ok('PKCE plain → invalid_request (S256 only)', redirErr(plain, 'invalid_request', /S256/), plain.location);
    const noMethod = await authorizeGet(webMember, { code_challenge_method: undefined });
    ok('PKCE method omitted (would default to plain) → invalid_request', redirErr(noMethod, 'invalid_request', /S256/), noMethod.location);
    const malformed = await authorizeGet(webMember, { code_challenge: 'short' });
    ok('malformed challenge → invalid_request', redirErr(malformed, 'invalid_request', /Malformed/), malformed.location);
    const implicit = await authorizeGet(webMember, { response_type: 'token' });
    ok('response_type=token → unsupported_response_type', redirErr(implicit, 'unsupported_response_type'), implicit.location);
    const state = newState();
    const foreign = await authorizeGet(webMember, { resource: 'https://other.example.test/mcp', state });
    ok('foreign resource → invalid_target', redirErr(foreign, 'invalid_target'), foreign.location);
    ok('error redirect carries state + iss', foreign.loc?.searchParams.get('state') === state && foreign.loc?.searchParams.get('iss') === ORIGIN);
    const own = await authorizeGet(webMember, { resource: RESOURCE + '/' });
    ok('own resource (trailing slash tolerated) → consent', own.status === 200 && !!ridOf(own.html), 'status=' + own.status);
  });

  // ==== CIMD SSRF guard =========================================================
  // helpers/oauth/public_https_url has no HTTP endpoint of its own; it guards the
  // outbound fetch of a Client ID Metadata Document, so it is exercised through
  // /oauth/authorize with URL client_ids: a refused URL renders the non-redirectable
  // "not an acceptable https URL" page WITHOUT any fetch. (A `pos-cli liquid-exec`
  // unit-style check of public_https_url / parse_url would be more direct.)

  it('CIMD — the SSRF guard refuses non-public client_id URLs before any fetch', async () => {
    const anon = makeWeb(base); // validation runs before the sign-in check
    const refused = {
      'plain http': 'http://client.example.com/oauth/client.json',
      'IPv4 loopback literal': 'https://127.0.0.1/client.json',
      'IPv6 loopback literal': 'https://[::1]/client.json',
      'cloud metadata IP': 'https://169.254.169.254/latest/meta-data',
      'private 10/8': 'https://10.0.0.1/client.json',
      'private 192.168/16': 'https://192.168.1.10/client.json',
      'private 172.16/12': 'https://172.16.0.5/client.json',
      'decimal IP': 'https://2130706433/client.json',
      'hex IP': 'https://0x7f000001/client.json',
      'octal IP': 'https://0177.0.0.1/client.json',
      'localhost': 'https://localhost/client.json',
      'localhost with trailing dot': 'https://localhost./client.json',
      'trailing-dot public name': 'https://client.example.com./client.json',
      '.local name': 'https://printer.local/client.json',
      '.internal name': 'https://metadata.google.internal/client.json',
      '.localhost name': 'https://app.localhost/client.json',
      'single-label host': 'https://intranet/client.json',
      'credentials in URL': 'https://user:pass@client.example.com/client.json',
      'non-default port': 'https://client.example.com:8443/client.json',
      'fragment': 'https://client.example.com/client.json#x',
      'no path': 'https://client.example.com/',
      'dot-segment path': 'https://client.example.com/a/../client.json',
    };
    for (const [name, url] of Object.entries(refused)) {
      const a = await authorizeGet(anon, { client_id: url, redirect_uri: 'https://client.example.com/cb' });
      ok(`${name} → 400 page, not redirected`, a.status === 400 && !a.location && /not an acceptable https URL/.test(a.html), `${url} → ${a.status} ${a.location || ''}`);
    }
    // Positive control: a public-looking https URL passes the guard and is fetched
    // (the .test name does not resolve → "Could not fetch"), proving the refusals
    // above came from the guard, not from a blanket CIMD failure.
    const pub = await authorizeGet(anon, { client_id: 'https://client.example.test/oauth/client.json', redirect_uri: 'https://client.example.test/cb' });
    ok('public https URL passes the guard (then fails the fetch)', pub.status === 400 && !pub.location && /Could not fetch the client metadata document/.test(pub.html), `${pub.status} ${pub.html.match(/class="err">([^<]*)/)?.[1]}`);
  });

  // platformOS parse_json decodes HTML entities unless raw_text: true, so a document whose
  // client_name held "&quot;" was refused and "&amp;" was shown and stored as "&".
  it('CIMD — a fetched client metadata document is accepted and its client name kept exactly', async () => {
    createdClients.add(CIMD_CLIENT_ID);
    const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const { verifier, challenge } = pkce();
    const a = await authorizeGet(webMember, { client_id: CIMD_CLIENT_ID, redirect_uri: CIMD_REDIRECT, code_challenge: challenge });
    ok('consent page 200', a.status === 200 && !!ridOf(a.html), `${a.status} ${a.html.match(/class="err">([^<]*)/)?.[1] || ''}`);
    const shown = a.html.match(/<h1>Authorize <b>([^<]*)<\/b>/)?.[1];
    ok('consent page shows the client name exactly', shown === escapeHtml(CIMD_NAME), shown);
    const d = await decide(webMember, a.html, 'approve');
    const code = d.loc?.searchParams.get('code');
    ok('approve → 302 to the document\'s redirect_uri with a code', d.status === 302 && d.location?.startsWith(CIMD_REDIRECT + '?') && !!code, d.location);
    const t = await token({ grant_type: 'authorization_code', code: code || '', code_verifier: verifier, client_id: CIMD_CLIENT_ID, redirect_uri: CIMD_REDIRECT });
    ok('token issued', t.status === 200 && /^mcp_at_/.test(t.json?.access_token || ''), t.text.slice(0, 160));
    const row = t.json?.access_token ? await tokenRowByAccess(t.json.access_token) : null;
    ok('grant bound to the document URL', row?.client_id === CIMD_CLIENT_ID, row?.client_id);
    const r = row ? await adm.gql(`{ records(per_page: 1, filter: { id: { value: "${row.id}" } table: { value: "${T_TOKEN}" } }) { results { label: property(name: "label") } } }`) : null;
    const label = r?.data?.records?.results?.[0]?.label;
    ok('grant stores the client name exactly', label === CIMD_NAME, label);
  });

  // ==== /oauth/token — authorization_code ======================================

  it('Token — code exchange happy path (+ the code is single-use)', async () => {
    const c = await getCode({ scope: 'mcp:read mcp:write' });
    ok('got a code', !!c.code);
    const r = await token({ grant_type: 'authorization_code', code: c.code, code_verifier: c.verifier, client_id: clientA, redirect_uri: REDIRECT_A, resource: RESOURCE });
    const b = r.json || {};
    ok('200 with a Bearer pair', r.status === 200 && b.token_type === 'Bearer' && /^mcp_at_/.test(b.access_token || '') && /^mcp_rt_/.test(b.refresh_token || ''), r.text.slice(0, 160));
    ok('expires_in = access TTL (3600)', b.expires_in === 3600, String(b.expires_in));
    ok('scope granted as requested', b.scope === 'mcp:read mcp:write', String(b.scope));
    ok('no-store', /no-store/.test(r.headers.get('cache-control') || ''));
    const row = await tokenRowByAccess(b.access_token || 'x');
    ok('grant row: kind oauth, bound to client + resource + user', row?.kind === 'oauth' && row?.client_id === clientA && row?.resource === RESOURCE && row?.user_id === mem.userId, JSON.stringify(row));
    ok('code marked used', (await codeRow(c.code))?.status === 'used');

    const again = await token({ grant_type: 'authorization_code', code: c.code, code_verifier: c.verifier, client_id: clientA, redirect_uri: REDIRECT_A });
    ok('code reuse → invalid_grant', tokenErr(again, 'invalid_grant'), again.text.slice(0, 120));
    const unknown = await token({ grant_type: 'authorization_code', code: 'mcp_ac_' + '0'.repeat(64), code_verifier: c.verifier, client_id: clientA, redirect_uri: REDIRECT_A });
    ok('unknown code → invalid_grant', tokenErr(unknown, 'invalid_grant'));
    ok('missing code → invalid_request', tokenErr(await token({ grant_type: 'authorization_code', client_id: clientA }), 'invalid_request'));
    ok('unknown grant_type → unsupported_grant_type', tokenErr(await token({ grant_type: 'password', client_id: clientA }), 'unsupported_grant_type'));
  });

  it('Token — PKCE: missing or wrong verifier → invalid_grant AND the code is burned', async () => {
    const c1 = await getCode();
    const missing = await token({ grant_type: 'authorization_code', code: c1.code, client_id: clientA, redirect_uri: REDIRECT_A });
    ok('no code_verifier → invalid_grant', tokenErr(missing, 'invalid_grant'), missing.text.slice(0, 120));
    const late1 = await token({ grant_type: 'authorization_code', code: c1.code, code_verifier: c1.verifier, client_id: clientA, redirect_uri: REDIRECT_A });
    ok('…then the right verifier also fails (code used up)', tokenErr(late1, 'invalid_grant'), late1.text.slice(0, 120));

    const c2 = await getCode();
    const wrong = await token({ grant_type: 'authorization_code', code: c2.code, code_verifier: pkce().verifier, client_id: clientA, redirect_uri: REDIRECT_A });
    ok('wrong verifier → invalid_grant', tokenErr(wrong, 'invalid_grant') && /PKCE/.test(wrong.json?.error_description || ''), wrong.text.slice(0, 120));
    const late2 = await token({ grant_type: 'authorization_code', code: c2.code, code_verifier: c2.verifier, client_id: clientA, redirect_uri: REDIRECT_A });
    ok('…then the right verifier also fails (one guess per code)', tokenErr(late2, 'invalid_grant'), late2.text.slice(0, 120));

    // Sending the challenge itself as the verifier is what a "plain" client would do.
    const c3 = await getCode();
    const asPlain = await token({ grant_type: 'authorization_code', code: c3.code, code_verifier: c3.challenge, client_id: clientA, redirect_uri: REDIRECT_A });
    ok('plain-style verifier (= challenge) → invalid_grant', tokenErr(asPlain, 'invalid_grant'));
  });

  it('Token — expired code → invalid_grant', async () => {
    const c = await getCode();
    const row = await codeRow(c.code);
    ok('code row found', !!row?.id);
    await setProps(T_CODE, row.id, { expires_at: Math.floor(Date.now() / 1000) - 5 });
    const r = await token({ grant_type: 'authorization_code', code: c.code, code_verifier: c.verifier, client_id: clientA, redirect_uri: REDIRECT_A });
    ok('expired code → invalid_grant', tokenErr(r, 'invalid_grant') && /expired/i.test(r.json?.error_description || ''), r.text.slice(0, 120));
  });

  it('Token — wrong client_id → invalid_grant', async () => {
    const c = await getCode();
    const r = await token({ grant_type: 'authorization_code', code: c.code, code_verifier: c.verifier, client_id: clientC, redirect_uri: REDIRECT_A });
    ok('code redeemed by another client → invalid_grant', tokenErr(r, 'invalid_grant') && /another client/.test(r.json?.error_description || ''), r.text.slice(0, 120));
    const late = await token({ grant_type: 'authorization_code', code: c.code, code_verifier: c.verifier, client_id: clientA, redirect_uri: REDIRECT_A });
    ok('…and the rightful client can no longer use it', tokenErr(late, 'invalid_grant'));
  });

  it('Token — redirect_uri binding (OAuth 2.1 §4.1.3)', async () => {
    // Client B (two redirect URIs): sent B1 on /authorize, presents B2 on /token.
    const c1 = await getCode({ clientId: clientB, redirectUri: REDIRECT_B1 });
    ok('client B got a code', !!c1.code && c1.loc?.href.startsWith(REDIRECT_B1 + '?'), c1.loc?.href);
    const wrong = await token({ grant_type: 'authorization_code', code: c1.code, code_verifier: c1.verifier, client_id: clientB, redirect_uri: REDIRECT_B2 });
    ok('different (also registered) redirect_uri → invalid_grant', tokenErr(wrong, 'invalid_grant') && /redirect_uri/.test(wrong.json?.error_description || ''), wrong.text.slice(0, 120));

    // redirect_uri was sent on /authorize → it is REQUIRED on /token.
    const c2 = await getCode({ clientId: clientB, redirectUri: REDIRECT_B2 });
    const omitted = await token({ grant_type: 'authorization_code', code: c2.code, code_verifier: c2.verifier, client_id: clientB });
    ok('redirect_uri sent on authorize but omitted on token → invalid_grant', tokenErr(omitted, 'invalid_grant') && /redirect_uri/.test(omitted.json?.error_description || ''), omitted.text.slice(0, 120));

    // Client A (single registered URI) relied on the default: it may omit it on both legs…
    const c3 = await getCode({ redirectUri: null });
    ok('omitted on authorize → redirected to the single registered URI', c3.loc?.href.startsWith(REDIRECT_A + '?') && !!c3.code, c3.loc?.href);
    ok('code row records redirect_uri_sent=false', (await codeRow(c3.code || 'x'))?.redirect_uri_sent === false);
    const both = await token({ grant_type: 'authorization_code', code: c3.code, code_verifier: c3.verifier, client_id: clientA });
    ok('omitted on both legs → 200', both.status === 200 && !!both.json?.access_token, both.text.slice(0, 120));
    // …or repeat the same value…
    const c4 = await getCode({ redirectUri: null });
    const same = await token({ grant_type: 'authorization_code', code: c4.code, code_verifier: c4.verifier, client_id: clientA, redirect_uri: REDIRECT_A });
    ok('omitted on authorize, same URI on token → 200', same.status === 200 && !!same.json?.access_token, same.text.slice(0, 120));
    // …but never a different one.
    const c5 = await getCode({ redirectUri: null });
    const other = await token({ grant_type: 'authorization_code', code: c5.code, code_verifier: c5.verifier, client_id: clientA, redirect_uri: 'https://client-a.example.test/other' });
    ok('omitted on authorize, different URI on token → invalid_grant', tokenErr(other, 'invalid_grant'), other.text.slice(0, 120));
  });

  it('Token — resource mismatch → invalid_target (RFC 8707)', async () => {
    const c = await getCode();
    const r = await token({ grant_type: 'authorization_code', code: c.code, code_verifier: c.verifier, client_id: clientA, redirect_uri: REDIRECT_A, resource: 'https://other.example.test/mcp' });
    ok('foreign resource on token → 400 invalid_target', tokenErr(r, 'invalid_target'), r.text.slice(0, 120));
    const c2 = await getCode();
    const slash = await token({ grant_type: 'authorization_code', code: c2.code, code_verifier: c2.verifier, client_id: clientA, redirect_uri: REDIRECT_A, resource: RESOURCE + '/' });
    ok('own resource with a trailing slash → 200', slash.status === 200 && !!slash.json?.access_token, slash.text.slice(0, 120));
  });

  // ==== /oauth/token — refresh_token ============================================

  it('Refresh — rotation; reusing the previous refresh token revokes the whole grant', async () => {
    const t1 = (await mintTokens()).json || {};
    ok('initial pair minted', !!t1.access_token && !!t1.refresh_token);
    const r2 = await token({ grant_type: 'refresh_token', refresh_token: t1.refresh_token, client_id: clientA });
    const t2 = r2.json || {};
    ok('refresh → 200 with a NEW pair', r2.status === 200 && !!t2.access_token && !!t2.refresh_token && t2.access_token !== t1.access_token && t2.refresh_token !== t1.refresh_token, r2.text.slice(0, 160));
    ok('scope carried over', t2.scope === t1.scope, `${t1.scope} → ${t2.scope}`);
    ok('new access token works on /mcp', isOkResult(await callTool(t2.access_token, 'test_public', {})));
    ok('old access token is dead after rotation (401)', isInvalidToken401(await callTool(t1.access_token, 'test_public', {})));
    const rowBefore = await tokenRowByAccess(t2.access_token);

    // Replay of the rotated-away refresh token = theft signal (OAuth 2.1 §4.3.1).
    const reuse = await token({ grant_type: 'refresh_token', refresh_token: t1.refresh_token, client_id: clientA });
    ok('old refresh token rejected → invalid_grant', tokenErr(reuse, 'invalid_grant'), reuse.text.slice(0, 120));
    const rowAfter = (await adm.gql(`{ records(per_page: 1, filter: { table: { value: "${T_TOKEN}" } id: { value: "${rowBefore?.id}" } }) { results { status: property(name: "status") } } }`))?.data?.records?.results?.[0];
    ok('reuse revoked the grant row', rowAfter?.status === 'revoked', JSON.stringify(rowAfter));
    const killed = await callTool(t2.access_token, 'test_public', {});
    ok('the CURRENT access token now → 401 invalid_token', isInvalidToken401(killed), 'status=' + killed.status);
    const dead = await token({ grant_type: 'refresh_token', refresh_token: t2.refresh_token, client_id: clientA });
    ok('the CURRENT refresh token is dead too → invalid_grant', tokenErr(dead, 'invalid_grant'), dead.text.slice(0, 120));
    ok('missing refresh_token → invalid_request', tokenErr(await token({ grant_type: 'refresh_token', client_id: clientA }), 'invalid_request'));
  });

  it('Refresh — wrong client_id → invalid_grant (grant left intact)', async () => {
    const t = (await mintTokens()).json || {};
    const r = await token({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: clientC });
    ok('refresh by another client → invalid_grant', tokenErr(r, 'invalid_grant') && /another client/.test(r.json?.error_description || ''), r.text.slice(0, 120));
    const anon = await token({ grant_type: 'refresh_token', refresh_token: t.refresh_token });
    ok('refresh without client_id → invalid_grant (public clients must identify themselves)', tokenErr(anon, 'invalid_grant'), anon.text.slice(0, 120));
    ok('access token still works', isOkResult(await callTool(t.access_token, 'test_public', {})));
    const good = await token({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: clientA });
    ok('the rightful client can still refresh (not rotated by the failed attempt)', good.status === 200 && !!good.json?.access_token, good.text.slice(0, 120));
  });

  it('Refresh + /mcp — a user who lost mcp.tokens.manage: 401 on /mcp, refresh invalid_grant', async () => {
    const t = (await mintTokens({ web: webValidator })).json || {};
    ok('validator minted a pair', !!t.access_token, JSON.stringify(t).slice(0, 120));
    ok('works while the user holds mcp_user', isOkResult(await callTool(t.access_token, 'test_public', {})));
    try {
      await setRoles(val.profileId, []);
      const r = await callTool(t.access_token, 'test_public', {});
      ok('role removed → /mcp 401 invalid_token', isInvalidToken401(r), 'status=' + r.status);
      const rf = await token({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: clientA });
      ok('role removed → refresh invalid_grant', tokenErr(rf, 'invalid_grant') && /no longer has MCP access/.test(rf.json?.error_description || ''), rf.text.slice(0, 120));
      const a = await authorizeGet(webValidator);
      ok('role removed → a new authorization is refused (access_denied)', a.status === 302 && a.loc?.searchParams.get('error') === 'access_denied', a.location);
    } finally {
      await setRoles(val.profileId, ['mcp_user']);
    }
    // Access is evaluated live, not by revoking: restoring the role restores the grant.
    const back = await token({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: clientA });
    ok('role restored → refresh works again', back.status === 200 && !!back.json?.access_token, back.text.slice(0, 120));
  });

  // ==== Using OAuth tokens on /mcp ==============================================

  it('/mcp — expired access token → 401 invalid_token; refresh recovers', async () => {
    const t = (await mintTokens()).json || {};
    const row = await tokenRowByAccess(t.access_token || 'x');
    ok('grant row found', !!row?.id);
    await setProps(T_TOKEN, row.id, { expires_at: Math.floor(Date.now() / 1000) - 5 });
    const r = await callTool(t.access_token, 'test_public', {});
    ok('expired → 401', r.status === 401 && r.json?.error?.code === -32001, 'status=' + r.status);
    ok('WWW-Authenticate error="invalid_token" + resource_metadata', /error="invalid_token"/.test(www(r)) && /resource_metadata="/.test(www(r)), www(r));
    const rf = await token({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: clientA });
    ok('refresh token outlives the access token → new pair', rf.status === 200 && !!rf.json?.access_token, rf.text.slice(0, 120));
    ok('new access token works', isOkResult(await callTool(rf.json?.access_token, 'test_public', {})));
  });

  it('/mcp — token bound to another resource → 401 invalid_token (audience)', async () => {
    const t = (await mintTokens()).json || {};
    const row = await tokenRowByAccess(t.access_token || 'x');
    ok('works for its own resource', isOkResult(await callTool(t.access_token, 'test_public', {})));
    await setProps(T_TOKEN, row.id, { resource: 'https://other-instance.example.test/mcp' });
    const r = await callTool(t.access_token, 'test_public', {});
    ok('foreign audience → 401 invalid_token', isInvalidToken401(r), `status=${r.status} ${www(r)}`);
  });

  it('/mcp — mcp:read-only token: read tool works, mutating tool → 403 insufficient_scope', async () => {
    const r = await mintTokens({ scope: 'mcp:read' });
    const t = r.json || {};
    ok('granted scope is exactly mcp:read', t.scope === 'mcp:read', String(t.scope));
    ok('read tool (test_public) works', isOkResult(await callTool(t.access_token, 'test_public', {})));
    const w = await callTool(t.access_token, 'test_write', { label: 'oauth-readonly' });
    ok('mutating tool → HTTP 403', w.status === 403, 'status=' + w.status);
    ok('403 carries error="insufficient_scope" with the scope to request', /error="insufficient_scope"/.test(www(w)) && /scope="mcp:read mcp:write"/.test(www(w)) && /resource_metadata="/.test(www(w)), www(w));
    ok('JSON-RPC body -32001 Insufficient scope', w.json?.error?.code === -32001 && /scope/i.test(w.json?.error?.message || ''));
    // Other JSON-RPC errors stay HTTP 200 (only 401 and 403 insufficient_scope are HTTP-level).
    const unk = await callTool(t.access_token, 'no_such_tool_oauth', {});
    ok('unknown tool with an OAuth token → HTTP 200 -32602', unk.status === 200 && unk.json?.error?.code === -32602, `status=${unk.status}`);

    const rw = (await mintTokens({ scope: 'mcp:write' })).json || {};
    ok('mcp:write request also gets the mcp:read floor', rw.scope === 'mcp:read mcp:write', String(rw.scope));
    ok('read+write token → mutating tool works', isOkResult(await callTool(rw.access_token, 'test_write', { label: 'oauth-readwrite' })));
    const junk = (await mintTokens({ scope: 'admin openid' })).json || {};
    ok('unknown scopes dropped → mcp:read', junk.scope === 'mcp:read', String(junk.scope));
  });

  // ==== /oauth/revoke ============================================================

  it('Revoke — only the issuing client can revoke; either token kills the grant', async () => {
    const t = (await mintTokens()).json || {};
    const foreign = await revoke({ token: t.access_token, client_id: clientC });
    ok('another client revoking → 200 (RFC 7009 never reveals)', foreign.status === 200, 'status=' + foreign.status);
    ok('…but the token still works', isOkResult(await callTool(t.access_token, 'test_public', {})));
    const anonymous = await revoke({ token: t.access_token });
    ok('revoke without client_id → 200, token still works', anonymous.status === 200 && isOkResult(await callTool(t.access_token, 'test_public', {})));
    const own = await revoke({ token: t.access_token, client_id: clientA });
    ok('issuing client revokes → 200', own.status === 200, 'status=' + own.status);
    ok('access token → 401', isInvalidToken401(await callTool(t.access_token, 'test_public', {})));
    ok('refresh token of the same grant → invalid_grant', tokenErr(await token({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: clientA }), 'invalid_grant'));

    const t2 = (await mintTokens()).json || {};
    const byRefresh = await revoke({ token: t2.refresh_token, token_type_hint: 'refresh_token', client_id: clientA });
    ok('revoking the REFRESH token → 200', byRefresh.status === 200);
    ok('…kills the access token of that grant too', isInvalidToken401(await callTool(t2.access_token, 'test_public', {})));

    ok('unknown token → 200', (await revoke({ token: 'mcp_at_' + '0'.repeat(64), client_id: clientA })).status === 200);
    ok('missing token → 400 invalid_request', tokenErr(await revoke({ client_id: clientA }), 'invalid_request'));
    // A manual (/mcp-tools) token is never revocable through the OAuth endpoint.
    await revoke({ token: mem.rawToken, client_id: clientA });
    ok('manual token unaffected by /oauth/revoke', isOkResult(await callTool(mem.rawToken, 'test_public', {})));
  });
});
