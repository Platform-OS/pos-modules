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
  // Operator login — verifies /mcp-admin is actually reachable (not 403) before returning
  // success; retries with backoff (a freshly-seeded user can take a beat to authenticate).
  async function operatorLogin({ email, password }) {
    for (let attempt = 0; attempt < 6; attempt++) {
      cookies = {};
      const lp = await (await get('sessions/new')).text();
      const csrf = metaTag(lp, 'csrf-token');
      await post('sessions', { authenticity_token: csrf, email, password });
      const adminPage = await (await get('mcp-admin')).text();
      if (!/403|Operators only|name="password"/i.test(adminPage)) return true;
      await new Promise(r => setTimeout(r, 500 + attempt * 500));
    }
    return false;
  }
  // Generic sign-in for any user (a successful login 302-redirects).
  async function sessionLogin({ email, password }) {
    for (let attempt = 0; attempt < 4; attempt++) {
      cookies = {};
      const lp = await (await get('sessions/new')).text();
      const csrf = metaTag(lp, 'csrf-token');
      const res = await post('sessions', { authenticity_token: csrf, email, password });
      if (res.status === 302) return true;
      await new Promise(r => setTimeout(r, 800));
    }
    return false;
  }
  return { get, post, formTok, metaTag, operatorLogin, sessionLogin };
}
