/**
 * pos-module-mcp — the approval gate as a switch (queries/approval/enforced).
 *
 * A `requires_approval` tool normally never runs inline. An instance can turn that
 * enforcement off — `MCP_CONFIG {"approval_enforced": false}` — and an app can answer
 * for itself through `config.approval_partial`, so admins flip it in the app's own
 * screens rather than editing an instance constant.
 *
 * Three properties matter more than the feature itself and are asserted here:
 *
 *  - It is read PER REQUEST, not from the registry cache. The built registry is cached
 *    for up to five minutes, so a manifest that decided this for itself would keep
 *    executing ungated for minutes after someone turned the gate back on. Every case
 *    below flips the switch and calls immediately, with no redeploy in between.
 *  - It fails SAFE. Only an explicit `false` turns the gate off; anything else — a
 *    missing partial, a partial that answers nothing, a malformed value — leaves it on.
 *  - The partial is told WHICH TOOL is being called, so an app can answer for one tool
 *    rather than for all of them: a desk may let an assistant add an internal note
 *    straight away while a reply to a customer still waits for a person. Asserted on
 *    both gate call sites — `tools/call` and the in-process `commands/execute/invoke`.
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { loadEnv, makeAdmin } from './fixtures.mjs';
import { makeMcp, makeConstants } from './lib/harness.mjs';
import { FIXT, applyReset } from './seed/seed.mjs';

const { base, admin } = loadEnv();
const adm = makeAdmin({ base, admin });
const { callTool } = makeMcp(base);
const { setConstant, unsetConstant } = makeConstants(adm);

const T_PENDING = 'modules/mcp/mcp_pending_approval';
const T_NOTE = 'test_note';
const mem = FIXT.users.member;
const INVOKE_PAGE = (base.endsWith('/') ? base : base + '/') + 'test/mcp-invoke';

/** The second gate call site: commands/execute/invoke, via the app's gated fixture page. */
async function invokeTool(token, name, args) {
  const res = await fetch(INVOKE_PAGE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ op: 'call', name, arguments: args }),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

async function pendingCount(principalId) {
  const r = await adm.gql(`{ records(per_page: 20, filter: { table: { value: "${T_PENDING}" } properties: [{ name: "principal_id", value: "${principalId}" }, { name: "status", value: "pending" }] }) { total_entries } } `);
  return r?.data?.records?.total_entries ?? 0;
}
async function clearPending(principalId) {
  const r = await adm.gql(`{ records(per_page: 50, filter: { table: { value: "${T_PENDING}" } properties: [{ name: "principal_id", value: "${principalId}" }] }) { results { id } } }`);
  for (const row of r?.data?.records?.results || []) { try { await adm.recordDelete(T_PENDING, row.id); } catch {} }
}
async function notesFor(userId) {
  const r = await adm.gql(`{ records(per_page: 50, filter: { table: { value: "${T_NOTE}" } properties: [{ name: "user_id", value: "${userId}" }] }) { results { id source: property(name: "source") } } }`);
  return (r?.data?.records?.results || []).filter((n) => n.source === 'test_approve');
}
async function clearNotes(userId) {
  const r = await adm.gql(`{ records(per_page: 50, filter: { table: { value: "${T_NOTE}" } properties: [{ name: "user_id", value: "${userId}" }] }) { results { id } } }`);
  for (const row of r?.data?.records?.results || []) { try { await adm.recordDelete(T_NOTE, row.id); } catch {} }
}
async function reset() {
  await clearPending(mem.principal);
  await clearNotes(mem.userId);
}

describe('approval gate switch', () => {
  beforeAll(async () => {
    await applyReset(adm.gql);
    await setConstant('MCP_ENABLE_TEST_TOOLS', 'true');
  }, 120000);

  afterAll(async () => {
    await unsetConstant('MCP_TEST_APPROVAL');
    await unsetConstant('MCP_CONFIG');
    await reset();
    await unsetConstant('MCP_ENABLE_TEST_TOOLS');
  }, 60000);

  it('on by default: the tool waits and nothing is written', async () => {
    await unsetConstant('MCP_CONFIG');
    await unsetConstant('MCP_TEST_APPROVAL');
    await reset();
    const r = await callTool(mem.rawToken, 'test_approve', { label: 'gate-on' });
    expect(r.json?.result?.structuredContent?.status).toBe('pending_approval');
    expect(await pendingCount(mem.principal)).toBe(1);
    expect((await notesFor(mem.userId)).length).toBe(0);
  });

  it('turned off by config: the same call executes inline, with nothing queued', async () => {
    await reset();
    await setConstant('MCP_CONFIG', JSON.stringify({ approval_enforced: false }));
    try {
      const r = await callTool(mem.rawToken, 'test_approve', { label: 'gate-off' });
      expect(r.json?.error).toBeFalsy();
      expect(r.json?.result?.structuredContent?.status).not.toBe('pending_approval');
      expect(await pendingCount(mem.principal)).toBe(0);
      expect((await notesFor(mem.userId)).length).toBe(1);
    } finally {
      await unsetConstant('MCP_CONFIG');
    }
  });

  it('turned back on: the very next call waits again, with no redeploy', async () => {
    // the point of resolving this per request rather than in the cached registry
    await reset();
    const r = await callTool(mem.rawToken, 'test_approve', { label: 'gate-back-on' });
    expect(r.json?.result?.structuredContent?.status).toBe('pending_approval');
    expect((await notesFor(mem.userId)).length).toBe(0);
  });

  it('an app partial answering false turns it off without touching MCP_CONFIG', async () => {
    await reset();
    await setConstant('MCP_TEST_APPROVAL', 'off');
    try {
      const r = await callTool(mem.rawToken, 'test_approve', { label: 'partial-off' });
      expect(r.json?.error).toBeFalsy();
      expect(await pendingCount(mem.principal)).toBe(0);
      expect((await notesFor(mem.userId)).length).toBe(1);
    } finally {
      await unsetConstant('MCP_TEST_APPROVAL');
    }
  });

  it('the app partial wins over the config key', async () => {
    // an app that owns the switch is not overridden by a stale instance constant
    await reset();
    await setConstant('MCP_CONFIG', JSON.stringify({ approval_enforced: false }));
    await setConstant('MCP_TEST_APPROVAL', 'on');
    try {
      const r = await callTool(mem.rawToken, 'test_approve', { label: 'partial-wins' });
      expect(r.json?.result?.structuredContent?.status).toBe('pending_approval');
      expect((await notesFor(mem.userId)).length).toBe(0);
    } finally {
      await unsetConstant('MCP_TEST_APPROVAL');
      await unsetConstant('MCP_CONFIG');
    }
  });

  it('a partial that answers nothing falls back to the config default: still gated', async () => {
    // fail-safe: "no answer" must never read as "do not enforce"
    await reset();
    await setConstant('MCP_TEST_APPROVAL', 'nonsense');
    try {
      const r = await callTool(mem.rawToken, 'test_approve', { label: 'partial-silent' });
      expect(r.json?.result?.structuredContent?.status).toBe('pending_approval');
      expect((await notesFor(mem.userId)).length).toBe(0);
    } finally {
      await unsetConstant('MCP_TEST_APPROVAL');
    }
  });

  it('the partial answers for ONE tool: off for the tool being called, which then runs inline', async () => {
    // What the tool name is for. Without it the partial cannot tell the tools apart, and
    // a desk that wants internal notes to go straight through has to turn the gate off
    // for its customer replies as well. The fixture answers `off` only for test_approve.
    await reset();
    await setConstant('MCP_TEST_APPROVAL', 'off:test_approve');
    try {
      const r = await callTool(mem.rawToken, 'test_approve', { label: 'per-tool-off' });
      expect(r.json?.error).toBeFalsy();
      expect(r.json?.result?.structuredContent?.status).not.toBe('pending_approval');
      expect(await pendingCount(mem.principal)).toBe(0);
      expect((await notesFor(mem.userId)).length).toBe(1);
    } finally {
      await unsetConstant('MCP_TEST_APPROVAL');
    }
  });

  it('off for a DIFFERENT tool leaves this one gated', async () => {
    // the answer is per tool, not "the partial said something, so stop enforcing"
    await reset();
    await setConstant('MCP_TEST_APPROVAL', 'off:test_write');
    try {
      const r = await callTool(mem.rawToken, 'test_approve', { label: 'per-tool-other' });
      expect(r.json?.result?.structuredContent?.status).toBe('pending_approval');
      expect(await pendingCount(mem.principal)).toBe(1);
      expect((await notesFor(mem.userId)).length).toBe(0);
    } finally {
      await unsetConstant('MCP_TEST_APPROVAL');
    }
  });

  it('the in-process path answers per tool too, not only tools/call', async () => {
    // commands/execute/invoke is the second place the gate is consulted. A change that
    // reaches only tools/call leaves the in-process path refusing a tool the app has
    // deliberately let through — the two paths would disagree about the same tool.
    await reset();
    await setConstant('MCP_TEST_APPROVAL', 'off:test_approve');
    try {
      const r = await invokeTool(mem.rawToken, 'test_approve', { label: 'per-tool-invoke' });
      expect(r.json?.result?.isError).toBe(false);
      expect(r.json?.outcome).toBe('success');
      expect(await pendingCount(mem.principal)).toBe(0);
      expect((await notesFor(mem.userId)).length).toBe(1);
    } finally {
      await unsetConstant('MCP_TEST_APPROVAL');
    }
  });
});
