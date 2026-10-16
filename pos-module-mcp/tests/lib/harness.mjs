/**
 * pos-module-mcp — shared test harness (single source of truth for the wire clients).
 *
 * Factory functions so each suite file gets its OWN isolated closure state (JSON-RPC id
 * counter, browser cookie jar) — no cross-file leakage even though the suites run in one
 * worker. Suite-specific record/state queries stay in their own files; only the generic
 * transport lives here.
 *
 *   makeMcp(base)      → MCP JSON-RPC-over-HTTP client (rpc / listNames / callTool + guards)
 *   makeConstants(adm) → constant_set / constant_unset over admin GraphQL
 *   makeWeb(base)      → browser cookie jar + operator/session login for the web consoles
 *
 * Re-exports loadEnv + makeAdmin from fixtures.mjs so a suite has one import point.
 */
import { loadEnv, makeAdmin } from '../fixtures.mjs';
export { loadEnv, makeAdmin };

/** MCP JSON-RPC client. `rpc(body, token?)` sends `body` verbatim (caller owns the id). */
export function makeMcp(base) {
  const MCP = base.endsWith('/') ? base + 'mcp' : base + '/mcp';
  let _id = 0;
  async function rpc(body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(MCP, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
    return { status: res.status, headers: res.headers, json, text };
  }
  async function listNames(token) {
    const r = await rpc({ jsonrpc: '2.0', id: ++_id, method: 'tools/list', params: {} }, token);
    return (r.json?.result?.tools || []).map(t => t.name);
  }
  async function callTool(token, name, args, meta) {
    const params = { name, arguments: args || {} };
    if (meta) params._meta = meta;
    return rpc({ jsonrpc: '2.0', id: ++_id, method: 'tools/call', params }, token);
  }
  const isDenied = (r) => r.json?.result?.isError === true || !!r.json?.error;
  const isOkResult = (r) => !!r.json?.result && r.json.result.isError !== true;
  return { MCP, rpc, listNames, callTool, isDenied, isOkResult };
}

/**
 * Modern (2026-07-28) MCP client: every request declares its revision in
 * `params._meta["io.modelcontextprotocol/protocolVersion"]` and carries the standard
 * headers (MCP-Protocol-Version, Mcp-Method, Mcp-Name), with the Base64 sentinel for a
 * name that is not a plain header-safe value.
 *
 *   send(method, params?, { token, version, capabilities, headers, omitHeaders, omitMeta, id })
 *     capabilities — the client capabilities declared on this request (default {})
 *     headers     — extra or overriding headers (to craft a mismatch)
 *     omitHeaders — header names to leave out (to craft a missing header)
 *     omitMeta    — leave the version out of `_meta`
 */
export const MODERN_VERSION = '2026-07-28';
export const TASKS_CAPABILITY = { extensions: { 'io.modelcontextprotocol/tasks': {} } };
export function headerValue(value) {
  const s = String(value);
  const safe = /^[\x21-\x7e]([\x20-\x7e]*[\x21-\x7e])?$/.test(s) && !(s.startsWith('=?base64?') && s.endsWith('?='));
  return safe ? s : `=?base64?${Buffer.from(s, 'utf8').toString('base64')}?=`;
}
export function makeModern(base) {
  const MCP = base.endsWith('/') ? base + 'mcp' : base + '/mcp';
  let _id = 0;
  async function send(method, params = {}, opts = {}) {
    const version = opts.version || MODERN_VERSION;
    const meta = { 'io.modelcontextprotocol/clientCapabilities': opts.capabilities || {} };
    if (!opts.omitMeta) meta['io.modelcontextprotocol/protocolVersion'] = version;
    const body = { jsonrpc: '2.0', id: opts.id ?? ++_id, method, params: { ...params, _meta: meta } };
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': version, 'Mcp-Method': method };
    const target = method === 'resources/read' ? params.uri
      : (method === 'tools/call' || method === 'prompts/get') ? params.name
      : method.startsWith('tasks/') ? params.taskId : undefined;
    if (target !== undefined) headers['Mcp-Name'] = headerValue(target);
    if (opts.token) headers['Authorization'] = 'Bearer ' + opts.token;
    Object.assign(headers, opts.headers || {});
    for (const h of opts.omitHeaders || []) delete headers[h];
    const res = await fetch(MCP, { method: 'POST', headers, body: JSON.stringify(body) });
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
    return { status: res.status, headers: res.headers, json, text };
  }
  return { MCP, send };
}

/** Transient config constant setters (admin GraphQL). */
export function makeConstants(adm) {
  return {
    setConstant: async (n, v) => { await adm.gql(`mutation { constant_set(name: "${n}", value: ${JSON.stringify(v)}) { name } }`); },
    unsetConstant: async (n) => { await adm.gql(`mutation { constant_unset(name: "${n}") { name } }`); },
  };
}

/** Browser cookie jar + logins for the operator (/mcp-admin) and token (/mcp-tools) consoles. */
export function makeWeb(base) {
  let cookies = {};
  const applyCookie = (r) => { for (const c of r.headers.getSetCookie?.() || []) { const [p] = c.split(';'); const i = p.indexOf('='); cookies[p.slice(0, i).trim()] = p.slice(i + 1).trim(); } };
  const cookieHeader = () => Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  async function get(path) { const r = await fetch(base + path, { headers: { Cookie: cookieHeader() }, redirect: 'manual' }); applyCookie(r); return r; }
  async function post(path, fields) { const r = await fetch(base + path, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookieHeader() }, body: new URLSearchParams(fields).toString() }); applyCookie(r); return r; }
  const formTok = (html) => (html.match(/name="authenticity_token"\s+value="([^"]*)"/) || [])[1];
  const metaTag = (html, name) => (html.match(new RegExp(`name="${name}"[^>]*content="([^"]*)"`)) || [])[1];
  // Operator login — verifies /mcp-admin actually renders (200, not a 403 page and not the
  // redirect to sign-in a failed login gets) before returning success; retries with backoff
  // (a freshly-seeded user can take a beat to authenticate).
  async function operatorLogin({ email, password }) {
    for (let attempt = 0; attempt < 6; attempt++) {
      cookies = {};
      const lp = await (await get('sessions/new')).text();
      const csrf = metaTag(lp, 'csrf-token') || formTok(lp); // the layout's meta tag, else the form's own token
      await post('sessions', { authenticity_token: csrf, email, password });
      const adminRes = await get('mcp-admin');
      const adminPage = await adminRes.text();
      if (adminRes.status === 200 && !/403|Operators only|name="password"/i.test(adminPage)) return true;
      await new Promise(r => setTimeout(r, 500 + attempt * 500));
    }
    return false;
  }
  // Generic sign-in for any user (a successful login 302-redirects).
  async function sessionLogin({ email, password }) {
    for (let attempt = 0; attempt < 4; attempt++) {
      cookies = {};
      const lp = await (await get('sessions/new')).text();
      const csrf = metaTag(lp, 'csrf-token') || formTok(lp); // the layout's meta tag, else the form's own token
      const res = await post('sessions', { authenticity_token: csrf, email, password });
      if (res.status === 302) return true;
      await new Promise(r => setTimeout(r, 800));
    }
    return false;
  }
  return { get, post, formTok, metaTag, operatorLogin, sessionLogin };
}
