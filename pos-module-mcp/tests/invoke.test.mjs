/**
 * pos-module-mcp — in-process tool call (commands/execute/invoke) and per-agent tool list
 * (queries/registry/for_agent).
 *
 * Driven through the gated fixture page `test/mcp-invoke` (app/, not shipped in the
 * module), which runs them for the identity of the request's bearer token. Every case
 * compares the in-process answer with what tools/call or tools/list gives the same
 * principal and agent, so the in-process path can do nothing an MCP client could not.
 * Uses the seeded member fixture and its narrowed token (allowed_tools: [test_public]).
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { loadEnv, makeAdmin } from './fixtures.mjs';
import { makeMcp, makeConstants } from './lib/harness.mjs';
import { FIXT, applyReset } from './seed/seed.mjs';

const { base, admin } = loadEnv();
const adm = makeAdmin({ base, admin });
const { callTool } = makeMcp(base);
const { setConstant, unsetConstant } = makeConstants(adm);
const PAGE = (base.endsWith('/') ? base : base + '/') + 'test/mcp-invoke';
const T_NOTE = 'test_note';
const T_LEDGER = 'modules/mcp/mcp_ledger';
const T_PENDING = 'modules/mcp/mcp_pending_approval';
const LABEL = 'invoke-suite';

let mem, narrowTok;

async function invoke(token, body) {
  const res = await fetch(PAGE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}
const call = (token, name, args) => invoke(token, { op: 'call', name, arguments: args });
const listFor = async (token) => ((await invoke(token, { op: 'list' })).json?.tools || []);

async function notesFor(userId, label) {
  const r = await adm.gql(`{ records(per_page: 100, filter: { table: { value: "${T_NOTE}" } properties: [{ name: "user_id", value: "${userId}" }, { name: "label", value: "${label}" }] }) { results { id source: property(name: "source") } } }`);
  return r?.data?.records?.results || [];
}
async function ledgerByRequest(requestId) {
  const r = await adm.gql(`{ records(per_page: 5, filter: { table: { value: "${T_LEDGER}" } properties: [{ name: "request_id", value: "${requestId}" }] }) { results { outcome: property(name: "execution_outcome") tool: property(name: "tool_name") authz: property(name: "authz_decision") reason: property(name: "authz_reason") client: property(name: "client_id") principal: property(name: "principal_id") sha: property(name: "input_sha256") } } }`);
  return r?.data?.records?.results || [];
}
async function pendingFor(principalId) {
  const r = await adm.gql(`{ records(per_page: 100, filter: { table: { value: "${T_PENDING}" } properties: [{ name: "principal_id", value: "${principalId}" }, { name: "status", value: "pending" }] }) { results { id } } }`);
  return r?.data?.records?.results || [];
}
async function deleteNotes(userId) {
  for (const label of [LABEL, LABEL + '-fail', LABEL + '-approve']) {
    for (const row of await notesFor(userId, label)) await adm.recordDelete(T_NOTE, row.id);
  }
}

describe('in-process tool call · same answers as tools/call', () => {
  beforeAll(async () => {
    await setConstant('MCP_ENABLE_TEST_TOOLS', 'true');
    await applyReset(adm.gql);
    mem = FIXT.users.member;
    narrowTok = mem.tokens.find((t) => t.label === 'fixt-narrow');
    await deleteNotes(mem.userId);
  });

  afterAll(async () => {
    try { await deleteNotes(mem.userId); } catch {}
    try { await applyReset(adm.gql); } catch {}
    await unsetConstant('MCP_ENABLE_TEST_TOOLS');
  });

  it('the fixture page is gated and needs a token', async () => {
    const r = await fetch(PAGE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"op":"list"}' });
    expect(r.status).toBe(401);
  });

  it('a read tool returns the same result as tools/call, and is ledgered as this agent', async () => {
    const args = { message: 'hello invoke' };
    const viaRpc = await callTool(mem.rawToken, 'test_echo', args);
    const viaInvoke = await call(mem.rawToken, 'test_echo', args);
    expect(viaInvoke.status).toBe(200);
    expect(viaInvoke.json.error).toBeUndefined();
    expect(viaInvoke.json.outcome).toBe('success');
    expect(viaInvoke.json.result).toEqual(viaRpc.json.result);
    const rows = await ledgerByRequest(viaInvoke.json.request_id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ outcome: 'success', tool: 'test_echo', authz: 'allow', principal: mem.principal });
    expect(rows[0].client).toBeTruthy();
  });

  it('an unknown tool is refused as tools/call refuses it, and ledgered', async () => {
    const viaRpc = await callTool(mem.rawToken, 'no_such_tool', {});
    const viaInvoke = await call(mem.rawToken, 'no_such_tool', {});
    expect(viaInvoke.json.error).toEqual({ code: viaRpc.json.error.code, message: viaRpc.json.error.message });
    expect(viaInvoke.json.error.code).toBe(-32602);
    const rows = await ledgerByRequest(viaInvoke.json.request_id);
    expect(rows[0]).toMatchObject({ outcome: 'invalid', tool: 'no_such_tool' });
  });

  it('invalid arguments come back as the same tool error as tools/call', async () => {
    const bad = { kind: 'delta', count: 99 };
    const viaRpc = await callTool(mem.rawToken, 'test_validate', bad);
    const viaInvoke = await call(mem.rawToken, 'test_validate', bad);
    expect(viaInvoke.json.result.isError).toBe(true);
    expect(viaInvoke.json.result).toEqual(viaRpc.json.result);
    expect(viaInvoke.json.outcome).toBe('invalid');
  });

  it('a call the policy denies is refused as tools/call refuses it, and ledgered as a denial', async () => {
    const viaRpc = await callTool(mem.rawToken, 'test_admin', {});
    const viaInvoke = await call(mem.rawToken, 'test_admin', {});
    expect(viaRpc.json.error?.code).toBe(-32001);
    expect(viaInvoke.json.error).toEqual({ code: -32001, message: viaRpc.json.error.message });
    const rows = await ledgerByRequest(viaInvoke.json.request_id);
    expect(rows[0]).toMatchObject({ outcome: 'denied', authz: 'deny', tool: 'test_admin' });
  });

  it('a mutating tool commits its write together with the ledger entry', async () => {
    const viaInvoke = await call(mem.rawToken, 'test_write', { label: LABEL });
    expect(viaInvoke.json.result.isError).toBe(false);
    expect(viaInvoke.json.outcome).toBe('success');
    const notes = await notesFor(mem.userId, LABEL);
    expect(notes).toHaveLength(1);
    expect(notes[0].source).toBe('test_write');
    const rows = await ledgerByRequest(viaInvoke.json.request_id);
    expect(rows[0]).toMatchObject({ outcome: 'success', tool: 'test_write' });
  });

  it('a failing mutating tool rolls back: no row, a tool error, and a rolled_back ledger entry', async () => {
    const viaInvoke = await call(mem.rawToken, 'test_fail', { label: LABEL + '-fail' });
    expect(viaInvoke.json.result.isError).toBe(true);
    expect(viaInvoke.json.outcome).toBe('rolled_back');
    expect(await notesFor(mem.userId, LABEL + '-fail')).toHaveLength(0);
    const rows = await ledgerByRequest(viaInvoke.json.request_id);
    expect(rows[0]).toMatchObject({ outcome: 'rolled_back', tool: 'test_fail' });
  });

  it('a tool that requires approval is refused and never queued or run', async () => {
    const before = (await pendingFor(mem.principal)).length;
    const viaInvoke = await call(mem.rawToken, 'test_approve', { label: LABEL + '-approve' });
    expect(viaInvoke.json.result.isError).toBe(true);
    expect(viaInvoke.json.outcome).toBe('denied');
    expect((await pendingFor(mem.principal)).length).toBe(before);
    expect(await notesFor(mem.userId, LABEL + '-approve')).toHaveLength(0);
    const rows = await ledgerByRequest(viaInvoke.json.request_id);
    expect(rows[0]).toMatchObject({ outcome: 'denied', reason: 'approval_required_in_process' });
  });

  it("the agent's allowed_tools narrow the in-process call as they narrow tools/call", async () => {
    const viaRpc = await callTool(narrowTok.raw, 'test_echo', { message: 'x' });
    const viaInvoke = await call(narrowTok.raw, 'test_echo', { message: 'x' });
    expect(viaRpc.json.error?.code).toBe(-32602);
    expect(viaInvoke.json.error?.code).toBe(-32602);
    const allowed = await call(narrowTok.raw, 'test_public', {});
    expect(allowed.json.result?.isError).toBe(false);
  });

  it('the tool list holds the tools the policy admits, in the tools/list shape, and honours allowed_tools', async () => {
    const tools = await listFor(mem.rawToken);
    const names = tools.map((t) => t.name);
    expect(names).toContain('test_public');
    expect(names).toContain('test_member');
    expect(names).not.toContain('test_admin');
    const echo = tools.find((t) => t.name === 'test_echo');
    expect(echo).toBeTruthy();
    expect(typeof echo.description).toBe('string');
    expect(echo.inputSchema?.type).toBe('object');
    expect(echo._meta).toHaveProperty('version');

    const narrowNames = (await listFor(narrowTok.raw)).map((t) => t.name);
    expect(narrowNames).toEqual(['test_public']);
  });
});
