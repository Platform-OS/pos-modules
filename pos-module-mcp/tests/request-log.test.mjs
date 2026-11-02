/**
 * pos-module-mcp — the log-safe request summary the /mcp page logs for a refused request
 * (mcp.request_refused) and for a tools/list with no tools (mcp.empty_tools_list):
 * helpers/rpc/request_summary.
 *
 * The instance log can arrive hours late, so the summary is checked through the gated
 * fixture page `test/mcp-request-summary` (app/, not shipped in the module), which
 * returns the summary of its own request. Each case sends a request shaped like an MCP
 * client's and checks what an operator would read: method, protocol versions, routing
 * headers, bearer presence, user agent and error — and that the bearer value is absent.
 * MUST run serially with the other suites (see vitest.config.mjs).
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { loadEnv, makeAdmin } from './fixtures.mjs';
import { makeConstants, MODERN_VERSION } from './lib/harness.mjs';

const { base, admin } = loadEnv();
const adm = makeAdmin({ base, admin });
const { setConstant, unsetConstant } = makeConstants(adm);
const PAGE = base + 'test/mcp-request-summary';
const RUN = randomBytes(6).toString('hex');
const SECRET = 'mcp_at_summary-test-' + RUN;
const KEYS = ['status', 'method', 'protocol_version', 'protocol_version_header', 'mcp_method_header', 'mcp_name_header', 'bearer', 'user_agent', 'error_code', 'error_message'];
const ok = (label, cond, detail) => expect.soft(cond, `${label}${detail === undefined ? '' : ' — ' + detail}`).toBe(true);

async function summary(body, headers) {
  const res = await fetch(PAGE, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

describe('request summary · what a refused request logs', () => {
  beforeAll(async () => { await setConstant('MCP_ENABLE_TEST_TOOLS', 'true'); });
  afterAll(async () => { await unsetConstant('MCP_ENABLE_TEST_TOOLS'); });

  it('a modern request: versions, routing headers, bearer presence and error, never the token', async () => {
    const ua = 'summary-test-modern-' + RUN;
    const r = await summary(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'memory_search', arguments: { query: 'secret words ' + RUN }, _meta: { 'io.modelcontextprotocol/protocolVersion': MODERN_VERSION } } },
      { 'MCP-Protocol-Version': MODERN_VERSION, 'Mcp-Method': 'tools/call', 'Mcp-Name': 'memory_search', Authorization: 'Bearer ' + SECRET, 'User-Agent': ua });
    const s = r.json;
    ok('fixture answered', r.status === 200 && !!s, `${r.status} ${r.text.slice(0, 160)}`);
    ok('only the documented keys', JSON.stringify(Object.keys(s || {}).sort()) === JSON.stringify([...KEYS].sort()), JSON.stringify(Object.keys(s || {})));
    ok('status', s?.status === 400, s?.status);
    ok('method', s?.method === 'tools/call', s?.method);
    ok('body protocol version', s?.protocol_version === MODERN_VERSION, s?.protocol_version);
    ok('header protocol version', s?.protocol_version_header === MODERN_VERSION, s?.protocol_version_header);
    ok('Mcp-Method header', s?.mcp_method_header === 'tools/call', s?.mcp_method_header);
    ok('Mcp-Name header', s?.mcp_name_header === 'memory_search', s?.mcp_name_header);
    ok('bearer presence', s?.bearer === true, s?.bearer);
    ok('user agent', s?.user_agent === ua, s?.user_agent);
    ok('error code and message', s?.error_code === -32022 && s?.error_message === 'Unsupported protocol version', `${s?.error_code} ${s?.error_message}`);
    ok('the token value is never included', !r.text.includes(SECRET));
    ok('tool arguments are never included', !r.text.includes('secret words'));
  });

  it('a legacy request: the initialize version, no routing headers, no bearer', async () => {
    const r = await summary(
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'summary-test', version: '0' } } },
      { 'User-Agent': 'summary-test-legacy-' + RUN });
    const s = r.json;
    ok('fixture answered', r.status === 200 && !!s, `${r.status} ${r.text.slice(0, 160)}`);
    ok('initialize version', s?.protocol_version === '2025-03-26', s?.protocol_version);
    ok('no header version', s?.protocol_version_header === '', s?.protocol_version_header);
    ok('no routing headers', s?.mcp_method_header === '' && s?.mcp_name_header === '', `${s?.mcp_method_header}|${s?.mcp_name_header}`);
    ok('no bearer', s?.bearer === false, s?.bearer);
  });
});
