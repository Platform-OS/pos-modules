/**
 * pos-module-mcp — per-agent tool switches (mcp_agent_setting) and the agents API.
 *
 * The engine's own `allowed_tools` is per TOKEN. One agent normally holds several
 * tokens — an OAuth client gets a fresh access token on every refresh — so a choice
 * stored on a token cannot express "this assistant may not reply to customers". These
 * switches follow the AGENT (helpers/identity/agent_key: the OAuth client_id, else the
 * token label, else the principal).
 *
 * What is asserted here is the part a reviewer cannot take on trust: that a switched-off
 * tool is refused on every path that can execute one, not merely hidden from a list.
 * The three paths are tools/call (registry/resolve_tool), the in-process call (same), and
 * an operator approving something proposed earlier (identity/token_still_authorized).
 *
 * The approval case is the one that caught a real bug: tokens/find_by_id did not select
 * `label`, so the agent key fell back to the principal, matched no stored row, and the
 * switches silently stopped being enforced on that path alone.
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { loadEnv, makeAdmin } from './fixtures.mjs';
import { makeMcp, makeConstants, makeWeb } from './lib/harness.mjs';
import { FIXT, applyReset } from './seed/seed.mjs';

const { base, admin } = loadEnv();
const adm = makeAdmin({ base, admin });
const { callTool, listNames } = makeMcp(base);
const web = makeWeb(base);
const { setConstant, unsetConstant } = makeConstants(adm);

const T_SETTING = 'modules/mcp/mcp_agent_setting';
const T_PENDING = 'modules/mcp/mcp_pending_approval';
const T_NOTE = 'test_note';

const mem = FIXT.users.member;
const op = FIXT.users.operator;
const outsider = FIXT.users.outsider;
// the member's primary token and a second one of theirs under a different label:
// a different label is a different agent, which is what proves the switch follows the
// agent rather than the person
const agentToken = mem.tokens.find((t) => t.label === 'fixt-member') || mem.tokens[0];
const otherAgentToken = mem.tokens.find((t) => t.label === 'fixt-revoke');
const AGENT = agentToken.label;
const OTHER_AGENT = otherAgentToken?.label;

const created = [];
async function setDisabled(userId, clientId, tools) {
  const id = await adm.recordCreate(T_SETTING, { user_id: String(userId), client_id: clientId, disabled_tools: tools });
  created.push(id);
  return id;
}
async function clearSettings() {
  for (const id of created.splice(0)) { try { await adm.recordDelete(T_SETTING, id); } catch {} }
}
async function pendingFor(principalId) {
  const r = await adm.gql(`{ records(per_page: 20, filter: { table: { value: "${T_PENDING}" } properties: [{ name: "principal_id", value: "${principalId}" }, { name: "status", value: "pending" }] }) { results { id handle: property(name: "handle") } } }`);
  return r?.data?.records?.results || [];
}
async function clearPending(principalId) {
  const r = await adm.gql(`{ records(per_page: 50, filter: { table: { value: "${T_PENDING}" } properties: [{ name: "principal_id", value: "${principalId}" }] }) { results { id } } }`);
  for (const row of r?.data?.records?.results || []) { try { await adm.recordDelete(T_PENDING, row.id); } catch {} }
}
async function notesFor(userId) {
  const r = await adm.gql(`{ records(per_page: 50, filter: { table: { value: "${T_NOTE}" } properties: [{ name: "user_id", value: "${userId}" }] }) { results { id source: property(name: "source") label: property(name: "label") } } }`);
  return r?.data?.records?.results || [];
}
async function clearNotes(userId) {
  for (const row of await notesFor(userId)) { try { await adm.recordDelete(T_NOTE, row.id); } catch {} }
}
const unknownTool = (r) => r.json?.error?.code === -32602;

describe('per-agent tool switches', () => {
  beforeAll(async () => {
    await applyReset(adm.gql);
    await setConstant('MCP_ENABLE_TEST_TOOLS', 'true');
  }, 120000);

  afterAll(async () => {
    await clearSettings();
    await clearPending(mem.principal);
    await clearNotes(mem.userId);
    await unsetConstant('MCP_ENABLE_TEST_TOOLS');
  }, 60000);

  it('a tool with no switch set is callable (the baseline)', async () => {
    await clearSettings();
    const r = await callTool(agentToken.raw, 'test_member', {});
    expect(r.json?.error).toBeFalsy();
  });

  it('a switched-off tool is refused on tools/call, and reported as not found', async () => {
    await clearSettings();
    await setDisabled(mem.userId, AGENT, ['test_member']);
    const r = await callTool(agentToken.raw, 'test_member', {});
    // not "forbidden": a narrowed-away tool is indistinguishable from one that does not
    // exist, the same least-disclosure behaviour allowed_tools already had
    expect(unknownTool(r)).toBe(true);
  });

  it('a tool left switched on is unaffected', async () => {
    await clearSettings();
    await setDisabled(mem.userId, AGENT, ['test_member']);
    const r = await callTool(agentToken.raw, 'test_public', {});
    expect(r.json?.error).toBeFalsy();
  });

  it('the switch follows the agent, not the person: the same user\'s other agent still works', async () => {
    if (!OTHER_AGENT) return; // seed without a second labelled token
    await clearSettings();
    await setDisabled(mem.userId, AGENT, ['test_member']);
    const blocked = await callTool(agentToken.raw, 'test_member', {});
    const allowed = await callTool(otherAgentToken.raw, 'test_member', {});
    expect(unknownTool(blocked)).toBe(true);
    expect(allowed.json?.error).toBeFalsy();
  });

  it('one person\'s switch never reaches another person with the same agent name', async () => {
    await clearSettings();
    // the outsider's row names the SAME client_id; rows are keyed by user AND client_id
    await setDisabled(outsider.userId, AGENT, ['test_member']);
    const r = await callTool(agentToken.raw, 'test_member', {});
    expect(r.json?.error).toBeFalsy();
  });

  it('an empty disabled list leaves every tool on', async () => {
    await clearSettings();
    await setDisabled(mem.userId, AGENT, []);
    const r = await callTool(agentToken.raw, 'test_member', {});
    expect(r.json?.error).toBeFalsy();
  });

  it('tools/list: the open list is unchanged, so its public cache hint stays honest', async () => {
    await clearSettings();
    await setDisabled(mem.userId, AGENT, ['test_member']);
    await unsetConstant('MCP_CONFIG');
    const names = await listNames(agentToken.raw);
    // route sends an `open` list with a `public` cache hint — "identical for everyone" —
    // so narrowing it per caller would let one agent's list be cached and served to another
    expect(names).toContain('test_member');
  });

  it('tools/list: a principal-scoped list hides it, where the hint is already private', async () => {
    await clearSettings();
    await setDisabled(mem.userId, AGENT, ['test_member']);
    await setConstant('MCP_CONFIG', JSON.stringify({ tools_list_scope: 'principal' }));
    try {
      const names = await listNames(agentToken.raw);
      expect(names).not.toContain('test_member');
      expect(names).toContain('test_public');
    } finally {
      await unsetConstant('MCP_CONFIG');
    }
  });

  it('an operator approving does not run a tool switched off since the request', async () => {
    // The regression test for the agent key: this path resolves the agent from the token
    // row via tokens/find_by_id, which must select `label` or the key falls back to the
    // principal, matches no row, and the switch is silently not enforced here.
    await clearSettings();
    await clearPending(mem.principal);
    await clearNotes(mem.userId);

    const proposed = await callTool(agentToken.raw, 'test_approve', { label: 'switched-off' });
    expect(proposed.json?.result?.structuredContent?.status).toBe('pending_approval');
    const pend = await pendingFor(mem.principal);
    expect(pend.length).toBe(1);

    // the person switches the tool off while the proposal waits
    await setDisabled(mem.userId, AGENT, ['test_approve']);

    const loggedIn = await web.operatorLogin({ email: op.email, password: op.password });
    expect(loggedIn).toBe(true);
    const adminPage = await (await web.get('mcp-admin')).text();
    const res = await web.post('mcp-admin/approve', { authenticity_token: web.formTok(adminPage), handle: pend[0].handle });
    expect([200, 302]).toContain(res.status);

    const notes = (await notesFor(mem.userId)).filter((n) => n.source === 'test_approve');
    expect(notes.length).toBe(0);
  }, 120000);

  it('an operator approving still runs a tool that is switched on', async () => {
    // the mirror of the case above: proves the refusal is the switch and not the test
    await clearSettings();
    await clearPending(mem.principal);
    await clearNotes(mem.userId);

    await callTool(agentToken.raw, 'test_approve', { label: 'still-on' });
    const pend = await pendingFor(mem.principal);
    expect(pend.length).toBe(1);

    const loggedIn = await web.operatorLogin({ email: op.email, password: op.password });
    expect(loggedIn).toBe(true);
    const adminPage = await (await web.get('mcp-admin')).text();
    await web.post('mcp-admin/approve', { authenticity_token: web.formTok(adminPage), handle: pend[0].handle });

    const notes = (await notesFor(mem.userId)).filter((n) => n.source === 'test_approve');
    expect(notes.length).toBe(1);
  }, 120000);
});
