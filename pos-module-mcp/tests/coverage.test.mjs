/**
 * pos-module-mcp — coverage suite (multi-principal governance planes), Vitest.
 *
 * Named/isolated tests with structured (JUnit) CI output. Faithful to the original
 * script: the wire clients come from ./lib/harness.mjs; `ok()` is `expect.soft`
 * (records & continues, so all sub-checks run and all failures report); `group→it`,
 * one-time setup→`beforeAll`, the old `finally`→`afterAll`. An `afterEach` unsets
 * MCP_CONFIG between groups so a hard failure can't leak the config into the next.
 *
 * MUST run serially / single-instance (see vitest.config.mjs). NON-DESTRUCTIVE: enables
 * MCP_ENABLE_TEST_TOOLS for the run, seeds/restores its own rows, unsets in afterAll.
 *
 * Run: npx vitest run tests/coverage.test.mjs
 * Env: MCP_URL, MCP_TOKEN (instance admin api token) — falls back to the repo .pos "ps".
 */
import { describe, it, beforeAll, afterAll, afterEach, expect } from 'vitest';
import { loadEnv, makeAdmin, pruneRate } from './fixtures.mjs';
import { makeMcp, makeConstants, makeWeb } from './lib/harness.mjs';
import { FIXT, applyReset, seededRecordIds } from './seed/seed.mjs';

// Ids of the persistent seeded rows — NEVER delete these (a deleted fixed id cannot be
// re-imported); cleanup removes only web-flow-created EXTRA rows.
const SEEDED = seededRecordIds();

const { base, admin } = loadEnv();
const adm = makeAdmin({ base, admin });
const { rpc, listNames, callTool, isDenied, isOkResult } = makeMcp(base);
const { setConstant, unsetConstant } = makeConstants(adm);
const { get: webGet, post: webPost, formTok: _formTok, operatorLogin, sessionLogin } = makeWeb(base);

const T_NOTE = 'test_note';
const T_LEDGER = 'modules/mcp/mcp_ledger';
const T_PENDING = 'modules/mcp/mcp_pending_approval';

// expect.soft is a drop-in for the original `ok()` (records & continues; the it() fails
// at the end if any soft check failed).
const ok = (name, cond, detail) => expect.soft(cond === true || cond === false ? cond : !!cond, detail ? `${name} — ${detail}` : name).toBe(true);

// ---- coverage-specific record/state queries (not shared; live here) --------
async function notesFor(userId) {
  const r = await adm.gql(`{ records(per_page: 100, filter: { table: { value: "${T_NOTE}" } properties: [{ name: "user_id", value: "${userId}" }] }) { results { id source: property(name: "source") label: property(name: "label") } } }`);
  return r?.data?.records?.results || [];
}
async function deleteNotesFor(userId) { for (const row of await notesFor(userId)) await adm.recordDelete(T_NOTE, row.id); }
async function ledgerFor(principalId) {
  const r = await adm.gql(`{ records(per_page: 200, filter: { table: { value: "${T_LEDGER}" } properties: [{ name: "principal_id", value: "${principalId}" }] }, sort: [{ id: { order: ASC } }]) { results { outcome: property(name: "execution_outcome") tool: property(name: "tool_name") authz: property(name: "authz_decision") } } }`);
  return r?.data?.records?.results || [];
}
async function pendingFor(principalId) {
  const r = await adm.gql(`{ records(per_page: 100, filter: { table: { value: "${T_PENDING}" } properties: [{ name: "principal_id", value: "${principalId}" }, { name: "status", value: "pending" }] }) { results { id } } }`);
  return r?.data?.records?.results || [];
}
async function clearPendingFor(principalId) {
  const r = await adm.gql(`{ records(per_page: 100, filter: { table: { value: "${T_PENDING}" } properties: [{ name: "principal_id", value: "${principalId}" }] }) { results { id } } }`);
  for (const row of (r?.data?.records?.results || [])) await adm.recordDelete(T_PENDING, row.id);
}
async function clearAbuse(principal) {
  const r = await adm.gql(`{ records(per_page: 200, filter: { table: { value: "modules/mcp/mcp_rate_counter" } properties: [{ name: "key", starts_with: "abuse:${principal}" }] }) { results { id } } }`);
  for (const row of (r?.data?.records?.results || [])) await adm.recordDelete('modules/mcp/mcp_rate_counter', row.id);
}
// Clear a principal's idempotency records — the fixed fixtures use FIXED keys, so a prior
// run's cached result would otherwise replay (no new write) and break re-runs.
async function clearIdempotencyFor(principalId) {
  const r = await adm.gql(`{ records(per_page: 200, filter: { table: { value: "modules/mcp/mcp_idempotency" } properties: [{ name: "principal_id", value: "${principalId}" }] }) { results { id } } }`);
  for (const row of (r?.data?.records?.results || [])) await adm.recordDelete('modules/mcp/mcp_idempotency', row.id);
}
async function pendingRecordsFor(principalId) {
  const r = await adm.gql(`{ records(per_page: 100, filter: { table: { value: "${T_PENDING}" } properties: [{ name: "principal_id", value: "${principalId}" }, { name: "status", value: "pending" }] }, sort: [{ id: { order: DESC } }]) { results { id handle: property(name: "handle") } } }`);
  return r?.data?.records?.results || [];
}
async function recordUpdate(table, id, props) {
  const p = Object.entries(props).map(([k, v]) => `{ name: "${k}", value: ${JSON.stringify(String(v))} }`).join(' ');
  const r = await adm.gql(`mutation { record_update(id: ${id}, record: { table: "${table}" properties: [ ${p} ] }) { id } }`);
  if (r?.errors) throw new Error('record_update failed: ' + JSON.stringify(r.errors));
}
async function accessRowFor(userId) {
  const r = await adm.gql(`{ records(per_page: 1, filter: { table: { value: "modules/mcp/mcp_access" } properties: [{ name: "user_id", value: "${userId}" }] }, sort: [{ id: { order: DESC } }]) { results { role: property(name: "role") status: property(name: "status") } } }`);
  return r?.data?.records?.results?.[0];
}
async function tokensFor(userId) {
  const r = await adm.gql(`{ records(per_page: 50, filter: { table: { value: "modules/mcp/mcp_token" } properties: [{ name: "user_id", value: "${userId}" }] }) { results { id label: property(name: "label") status: property(name: "status") } } }`);
  return r?.data?.records?.results || [];
}
// Remove a user's WEB-FLOW-created access + token rows (mint/grant create rows the fixtures
// don't track). SKIPS seeded fixture ids — those persist and are re-baselined by applyReset.
async function purgeUserRecords(userId) {
  for (const t of await tokensFor(userId)) { if (SEEDED.has(String(t.id))) continue; try { await adm.recordDelete('modules/mcp/mcp_token', t.id); } catch {} }
  const a = await adm.gql(`{ records(per_page: 50, filter: { table: { value: "modules/mcp/mcp_access" } properties: [{ name: "user_id", value: "${userId}" }] }) { results { id } } }`);
  for (const row of (a?.data?.records?.results || [])) { if (SEEDED.has(String(row.id))) continue; try { await adm.recordDelete('modules/mcp/mcp_access', row.id); } catch {} }
}

// ---- fixture handles (resolved in beforeAll) ----
let op, mem, out, req, rate, abuseA, abuseB, abuseC, validator, narrowTok, revokeTok;

describe('coverage · multi-principal governance planes', () => {
  beforeAll(async () => {
    await setConstant('MCP_ENABLE_TEST_TOOLS', 'true');
    // Deterministic fixtures (TASK-5): (re-)import the fixed users/tokens/access to baseline.
    await applyReset(adm.gql);
    op = FIXT.users.operator; mem = FIXT.users.member; out = FIXT.users.outsider; req = FIXT.users.requester;
    rate = FIXT.users.rate; abuseA = FIXT.users.abuseA; abuseB = FIXT.users.abuseB; abuseC = FIXT.users.abuseC; validator = FIXT.users.validator;
    narrowTok = mem.tokens.find(t => t.label === 'fixt-narrow');   // pre-seeded, allowed_tools:[test_public]
    revokeTok = mem.tokens.find(t => t.label === 'fixt-revoke');   // pre-seeded, revoked+reset per run
  });

  afterAll(async () => {
    // ---- reset transient state + restore fixtures to baseline (no user teardown) ----
    await unsetConstant('MCP_CONFIG');
    const principals = [op, mem, out, req, rate, abuseA, abuseB, abuseC, validator];
    for (const h of principals) { if (!h) continue; try { await deleteNotesFor(h.userId); } catch {} try { await clearPendingFor(h.principal); } catch {} try { await pruneRate(adm, h.principal); } catch {} try { await clearAbuse(h.principal); } catch {} try { await clearIdempotencyFor(h.principal); } catch {} }
    for (const h of [out, mem]) { try { await purgeUserRecords(h.userId); } catch {} }
    try { await applyReset(adm.gql); } catch {}
    await unsetConstant('MCP_ENABLE_TEST_TOOLS');
  });

  // Guard: never let a group leak the config constant into the next (unset is idempotent).
  afterEach(async () => { try { await unsetConstant('MCP_CONFIG'); } catch {} });

  it('tools/list visibility scoping (§14.2)', async () => {
    await unsetConstant('MCP_CONFIG'); // 'open' (default)
    {
      const memN = await listNames(mem.rawToken);
      ok('open mode: member sees test_admin (nothing filtered)', memN.includes('test_admin'));
    }
    await setConstant('MCP_CONFIG', JSON.stringify({ tools_list_scope: 'principal' }));
    {
      const tiers = ['test_public', 'test_member', 'test_admin'];
      const opN = await listNames(op.rawToken);
      const memN = await listNames(mem.rawToken);
      const outN = await listNames(out.rawToken);
      const anonN = await listNames(null);
      ok('principal: operator sees all 3 tiers', tiers.every(t => opN.includes(t)), opN.filter(n => n.startsWith('test_')).join(','));
      ok('principal: member sees public+member but NOT admin', memN.includes('test_public') && memN.includes('test_member') && !memN.includes('test_admin'), memN.filter(n => n.startsWith('test_')).join(','));
      ok('principal: outsider sees ONLY public (no member/admin leak)', outN.includes('test_public') && !outN.includes('test_member') && !outN.includes('test_admin'), outN.filter(n => n.startsWith('test_')).join(','));
      ok('principal: anon sees NO test tiers', !tiers.some(t => anonN.includes(t)), anonN.filter(n => n.startsWith('test_')).join(','));
    }
    await unsetConstant('MCP_CONFIG');
  });

  it('Authorization — deny path (§12)', async () => {
    ok('member → test_member allowed', isOkResult(await callTool(mem.rawToken, 'test_member', {})));
    ok('outsider → test_member DENIED', isDenied(await callTool(out.rawToken, 'test_member', {})));
    ok('member → test_admin DENIED', isDenied(await callTool(mem.rawToken, 'test_admin', {})));
    {
      const led = await ledgerFor(out.principal);
      ok('deny is attested in the ledger', led.some(x => x.authz === 'deny'));
    }
  });

  it('Execution — transaction commit (§11)', async () => {
    await deleteNotesFor(mem.userId);
    ok('member test_write → ok', isOkResult(await callTool(mem.rawToken, 'test_write', { label: 'commit1' })));
    {
      const notes = await notesFor(mem.userId);
      ok('committed row persists, owned by member', notes.some(x => x.source === 'test_write' && x.label === 'commit1'));
    }
  });

  it('Idempotency (§16)', async () => {
    await deleteNotesFor(mem.userId);
    await clearIdempotencyFor(mem.principal);
    {
      const key = 'cov-idem-' + mem.userId;
      await callTool(mem.rawToken, 'test_write', { label: 'idem' }, { idempotencyKey: key });
      await callTool(mem.rawToken, 'test_write', { label: 'idem' }, { idempotencyKey: key });
      const rows = (await notesFor(mem.userId)).filter(x => x.source === 'test_write');
      ok('same key twice → exactly one row written', rows.length === 1, 'rows=' + rows.length);
      const conflict = await callTool(mem.rawToken, 'test_write', { label: 'different' }, { idempotencyKey: key });
      ok('same key + different args → 409', conflict.status === 409, 'status=' + conflict.status);
    }
  });

  it('Transaction rollback (§11)', async () => {
    await deleteNotesFor(mem.userId);
    ok('test_fail → isError', (await callTool(mem.rawToken, 'test_fail', { label: 'rollme' })).json?.result?.isError === true);
    {
      const rows = (await notesFor(mem.userId)).filter(x => x.source === 'test_fail');
      ok('rolled back → NO row persisted', rows.length === 0, 'rows=' + rows.length);
      const led = await ledgerFor(mem.principal);
      ok('ledger records a rolled_back outcome', led.some(x => x.outcome === 'rolled_back'));
    }
  });

  it('Approval — queue / dedup / cap (§9.6)', async () => {
    await deleteNotesFor(mem.userId);
    await clearPendingFor(mem.principal);
    {
      const r1 = await callTool(mem.rawToken, 'test_approve', { label: 'appr' });
      ok('requires_approval → queued (isError pending), not executed', /pending/i.test(JSON.stringify(r1.json?.result || {})));
      ok('no row written before approval', (await notesFor(mem.userId)).filter(x => x.source === 'test_approve').length === 0);
      ok('one pending approval recorded', (await pendingFor(mem.principal)).length === 1, 'pending=' + (await pendingFor(mem.principal)).length);
      await callTool(mem.rawToken, 'test_approve', { label: 'appr' });
      ok('duplicate proposal deduped (still one pending)', (await pendingFor(mem.principal)).length === 1, 'pending=' + (await pendingFor(mem.principal)).length);
      await callTool(mem.rawToken, 'test_approve', { label: 'appr2' });
      await callTool(mem.rawToken, 'test_approve', { label: 'appr3' });
      const overflow = await callTool(mem.rawToken, 'test_approve', { label: 'appr4' });
      ok('queue cap → overflow refused (queue_full)', /queue_full|full|throttl/i.test(JSON.stringify(overflow.json?.result || {})), JSON.stringify(overflow.json?.result?.structuredContent || overflow.json?.result || {}).slice(0, 120));
      ok('cap holds pending at the max (3)', (await pendingFor(mem.principal)).length === 3, 'pending=' + (await pendingFor(mem.principal)).length);
    }
  });

  it('Approval — approve executes as original principal (§9.6)', async () => {
    await clearPendingFor(mem.principal);
    await deleteNotesFor(mem.userId);
    await deleteNotesFor(op.userId);
    await callTool(mem.rawToken, 'test_approve', { label: 'execnow' });
    {
      const pend = await pendingRecordsFor(mem.principal);
      ok('one pending queued for member', pend.length === 1, 'pending=' + pend.length);
      const handle = pend[0]?.handle;
      const loggedIn = await operatorLogin(op);
      ok('operator reaches the console (login ok)', loggedIn);
      const adminPage = await (await webGet('mcp-admin')).text();
      const approveRes = await webPost('mcp-admin/approve', { authenticity_token: _formTok(adminPage), handle });
      ok('approve POST accepted', approveRes.status === 302 || approveRes.status === 200, 'status=' + approveRes.status);
      const memNotes = (await notesFor(mem.userId)).filter(x => x.source === 'test_approve');
      const opNotes = (await notesFor(op.userId)).filter(x => x.source === 'test_approve');
      ok('approved action EXECUTED (row now exists)', memNotes.length === 1 && memNotes[0].label === 'execnow', 'member rows=' + memNotes.length);
      ok('executed AS THE ORIGINAL PRINCIPAL (member owns it, not the operator)', memNotes.length === 1 && opNotes.length === 0, 'op rows=' + opNotes.length);
    }
  });

  it('Approval — reject never executes (§9.6)', async () => {
    await clearPendingFor(mem.principal);
    await deleteNotesFor(mem.userId);
    await callTool(mem.rawToken, 'test_approve', { label: 'rejectme' });
    {
      const pend = await pendingRecordsFor(mem.principal);
      const handle = pend[0]?.handle;
      const adminPage = await (await webGet('mcp-admin')).text();
      const rejectRes = await webPost('mcp-admin/reject', { authenticity_token: _formTok(adminPage), handle });
      ok('reject POST accepted', rejectRes.status === 302 || rejectRes.status === 200, 'status=' + rejectRes.status);
      const memNotes = (await notesFor(mem.userId)).filter(x => x.source === 'test_approve' && x.label === 'rejectme');
      ok('rejected action NEVER executed (no row)', memNotes.length === 0, 'rows=' + memNotes.length);
    }
  });

  it('Abuse — auto-suspend after threshold (§12.4)', async () => {
    // Dedicated principal (abuseA) so a suspend never contaminates the shared fixtures.
    await setConstant('MCP_CONFIG', JSON.stringify({ defaults: { abuse_threshold: 3, abuse_window_seconds: 600 } }));
    await clearAbuse(abuseA.principal);
    await pruneRate(adm, abuseA.principal);
    {
      for (let i = 0; i < 4; i++) await callTool(abuseA.rawToken, 'test_admin', {});
      const after = await callTool(abuseA.rawToken, 'test_public', {});
      ok('token auto-suspended past threshold → 401', after.status === 401, 'status=' + after.status);
    }
    await unsetConstant('MCP_CONFIG');
  });

  it('Token lifecycle — revoke + allowed_tools narrowing (§9, §6.2)', async () => {
    {
      ok('active token works', isOkResult(await callTool(revokeTok.raw, 'test_public', {})));
      await recordUpdate('modules/mcp/mcp_token', revokeTok.id, { status: 'revoked' });
      const after = await callTool(revokeTok.raw, 'test_public', {});
      ok('revoked token → 401 (central kill switch)', after.status === 401, 'status=' + after.status);
    }
    {
      ok('narrowed token: an allowed tool works', isOkResult(await callTool(narrowTok.raw, 'test_public', {})));
      const denied = await callTool(narrowTok.raw, 'test_member', {});
      ok('narrowed token: a NON-allowed tool is refused (never widens)', isDenied(denied), 'status=' + denied.status);
    }
  });

  it('Approval — expired approval never executes (§9.6)', async () => {
    await clearPendingFor(mem.principal);
    await deleteNotesFor(mem.userId);
    await callTool(mem.rawToken, 'test_approve', { label: 'expireme' });
    {
      const pend = await pendingRecordsFor(mem.principal);
      ok('one pending to expire', pend.length === 1, 'pending=' + pend.length);
      await recordUpdate(T_PENDING, pend[0].id, { expires_at: '1' });
      const adminPage = await (await webGet('mcp-admin')).text();
      await webPost('mcp-admin/approve', { authenticity_token: _formTok(adminPage), handle: pend[0].handle });
      const memNotes = (await notesFor(mem.userId)).filter(x => x.source === 'test_approve' && x.label === 'expireme');
      ok('approving an EXPIRED approval does NOT execute (no row)', memNotes.length === 0, 'rows=' + memNotes.length);
    }
  });

  it('Ledger — tamper-evidence via verify_chain (§6)', async () => {
    const chainOk = (h) => /entries intact|chain verified/i.test(h) && !/CHAIN BROKEN/i.test(h);
    const chainBroken = (h) => /CHAIN BROKEN/i.test(h);
    await operatorLogin(op);
    let page = await (await webGet('mcp-admin')).text();
    ok('chain intact before tamper', chainOk(page));
    const q = `{ records(per_page: 1, filter: { table: { value: "${T_LEDGER}" } }, sort: [{ id: { order: DESC } }]) { results { id outcome: property(name: "execution_outcome") } } }`;
    const row = (await adm.gql(q))?.data?.records?.results?.[0];
    const original = row?.outcome;
    try {
      await recordUpdate(T_LEDGER, row.id, { execution_outcome: original === 'success' ? 'rolled_back' : 'success' });
      page = await (await webGet('mcp-admin')).text();
      ok('verify_chain DETECTS the tampered ledger row', chainBroken(page));
    } finally {
      await recordUpdate(T_LEDGER, row.id, { execution_outcome: original });
    }
    page = await (await webGet('mcp-admin')).text();
    ok('chain valid again after exact restore', chainOk(page));
  });

  it('Validation matrix (§10, strict, no coercion)', async () => {
    const V = (args) => callTool(validator.rawToken, 'test_validate', args); // dedicated: its many arg-rejections don't accrue on `member`
    const rej = (r) => r.json?.error?.code === -32602;
    const valid = { kind: 'alpha', count: 5, ratio: 0.5, email: 'a@b.co', uid: '123e4567-e89b-12d3-a456-426614174000', when: '2026-01-01T00:00:00Z', tags: ['x'], code: 'abc' };
    ok('fully valid input accepted', isOkResult(await V(valid)));
    const bad = async (name, patch) => ok(name, rej(await V({ ...valid, ...patch })));
    await bad('enum: unknown value rejected', { kind: 'delta' });
    await bad('integer: below minimum rejected', { count: 0 });
    await bad('integer: above maximum rejected', { count: 11 });
    await bad('integer: string not coerced', { count: '5' });
    await bad('number: exclusiveMinimum rejected', { ratio: 0 });
    await bad('format email: bad value rejected', { email: 'not-an-email' });
    await bad('format uuid: bad value rejected', { uid: 'nope' });
    await bad('format date-time: bad value rejected', { when: 'yesterday' });
    await bad('array: minItems rejected', { tags: [] });
    await bad('array: maxItems rejected', { tags: ['a', 'b', 'c', 'd'] });
    await bad('array: item type rejected', { tags: [1, 2] });
    await bad('string: minLength rejected', { code: 'a' });
    await bad('string: pattern rejected', { code: 'AB' });
    ok('additionalProperties:false → unknown key rejected', rej(await V({ ...valid, surprise: 1 })));
  });

  it('Rate limiting — per-principal isolation (§12.4)', async () => {
    await setConstant('MCP_CONFIG', JSON.stringify({ defaults: { rate_limit_per_min: 3 } }));
    await pruneRate(adm, rate.principal);
    await pruneRate(adm, op.principal);
    {
      const codes = [];
      for (let i = 0; i < 5; i++) codes.push((await callTool(rate.rawToken, 'test_public', {})).status);
      ok('a principal exhausts its own limit → 429', codes.slice(0, 3).every(c => c === 200) && codes.slice(3).some(c => c === 429), codes.join(','));
      const other = (await callTool(op.rawToken, 'test_public', {})).status;
      ok('a DIFFERENT principal is unaffected (isolation)', other === 200, 'status=' + other);
    }
    await unsetConstant('MCP_CONFIG');
    await pruneRate(adm, rate.principal);
  });

  it('Abuse — windowed counter resets across windows (§12.4)', async () => {
    await clearAbuse(abuseB.principal); // dedicated principal = clean slate
    await setConstant('MCP_CONFIG', JSON.stringify({ defaults: { abuse_threshold: 3, abuse_window_seconds: 1 } }));
    await callTool(abuseB.rawToken, 'test_admin', {}); // deny = violation (window A)
    await callTool(abuseB.rawToken, 'test_admin', {});
    await new Promise(r => setTimeout(r, 1500)); // roll to window B
    await callTool(abuseB.rawToken, 'test_admin', {}); // window B
    await callTool(abuseB.rawToken, 'test_admin', {});
    const after = await callTool(abuseB.rawToken, 'test_public', {});
    ok('violations split across windows do NOT accumulate to suspend', after.status === 200, 'status=' + after.status);
    await unsetConstant('MCP_CONFIG');
  });

  it('Abuse — unknown-tool attempts trigger suspend (§12.4)', async () => {
    await clearAbuse(abuseC.principal);
    await setConstant('MCP_CONFIG', JSON.stringify({ defaults: { abuse_threshold: 3, abuse_window_seconds: 600 } }));
    for (let i = 0; i < 4; i++) await callTool(abuseC.rawToken, 'no_such_tool_xyz', {}); // unknown-tool violations
    const after = await callTool(abuseC.rawToken, 'test_public', {});
    ok('repeated unknown-tool attempts → token suspended (401)', after.status === 401, 'status=' + after.status);
    await unsetConstant('MCP_CONFIG');
  });

  it('Approval status polling — mcp_approval_status (§9.6)', async () => {
    await clearAbuse(mem.principal);
    await clearPendingFor(mem.principal);
    await callTool(mem.rawToken, 'test_approve', { label: 'pollme' });
    {
      const pend = await pendingRecordsFor(mem.principal);
      const handle = pend[0]?.handle;
      const st = await callTool(mem.rawToken, 'mcp_approval_status', { handle });
      ok('owner polls handle → status pending', st.json?.result?.structuredContent?.status === 'pending', JSON.stringify(st.json?.result?.structuredContent || {}).slice(0, 80));
      const stOther = await callTool(op.rawToken, 'mcp_approval_status', { handle });
      ok('another principal polling the handle → not found (no enumeration)', stOther.json?.result?.isError === true);
    }
  });

  it('Tasks extension — approval-as-task: poll / cancel / self-approve blocked (2026-07-28)', async () => {
    const m26 = { _meta: { protocolVersion: '2026-07-28' } };
    await clearPendingFor(mem.principal);
    const pend = await callTool(mem.rawToken, 'test_approve', { label: 'tasks-ext' });
    const taskId = pend.json?.result?.structuredContent?.taskId;
    ok('pending response carries taskId (== handle)', !!taskId && taskId === pend.json?.result?.structuredContent?.handle, 'taskId=' + taskId);

    // Gated to a 2026 client; a 2025 client uses mcp_approval_status instead.
    const g25 = await rpc({ jsonrpc: '2.0', id: 1, method: 'tasks/get', params: { taskId } }, mem.rawToken);
    ok('tasks/get without 2026 negotiation → -32601 (method not found)', g25.json?.error?.code === -32601, 'code=' + g25.json?.error?.code);

    const g26 = await rpc({ jsonrpc: '2.0', id: 2, method: 'tasks/get', ...m26, params: { taskId } }, mem.rawToken);
    ok('owner tasks/get @2026 → status working, tool test_approve', g26.json?.result?.task?.status === 'working' && g26.json?.result?.task?.tool === 'test_approve', JSON.stringify(g26.json?.result?.task || g26.json?.error || {}).slice(0, 100));

    const gOther = await rpc({ jsonrpc: '2.0', id: 3, method: 'tasks/get', ...m26, params: { taskId } }, op.rawToken);
    ok('another principal tasks/get → not found (-32002, no enumeration)', gOther.json?.error?.code === -32002);

    const upd = await rpc({ jsonrpc: '2.0', id: 4, method: 'tasks/update', ...m26, params: { taskId, status: 'cancelled' } }, mem.rawToken);
    ok('owner tasks/update cancel → status cancelled', upd.json?.result?.task?.status === 'cancelled', JSON.stringify(upd.json?.result?.task || upd.json?.error || {}).slice(0, 100));
    const gAfter = await rpc({ jsonrpc: '2.0', id: 5, method: 'tasks/get', ...m26, params: { taskId } }, mem.rawToken);
    ok('tasks/get after cancel → cancelled', gAfter.json?.result?.task?.status === 'cancelled');
    ok('cancel frees the pending queue slot', (await pendingFor(mem.principal)).length === 0, 'pending=' + (await pendingFor(mem.principal)).length);
    const upd2 = await rpc({ jsonrpc: '2.0', id: 6, method: 'tasks/update', ...m26, params: { taskId } }, mem.rawToken);
    ok('cancelling a non-pending task is refused (-32002)', upd2.json?.error?.code === -32002);

    // SECURITY: an agent can NEVER self-approve via tasks/update — only cancel is allowed.
    await clearPendingFor(mem.principal);
    const pend2 = await callTool(mem.rawToken, 'test_approve', { label: 'tasks-ext2' });
    const tid2 = pend2.json?.result?.structuredContent?.taskId;
    const selfApprove = await rpc({ jsonrpc: '2.0', id: 7, method: 'tasks/update', ...m26, params: { taskId: tid2, status: 'approved' } }, mem.rawToken);
    ok('agent CANNOT self-approve via tasks/update (only cancel) → -32602', selfApprove.json?.error?.code === -32602, 'code=' + selfApprove.json?.error?.code);
    const stillPending = await rpc({ jsonrpc: '2.0', id: 8, method: 'tasks/get', ...m26, params: { taskId: tid2 } }, mem.rawToken);
    ok('the self-approve attempt did NOT execute (still working)', stillPending.json?.result?.task?.status === 'working');
    await clearPendingFor(mem.principal);

    // Capability advertised only to a 2026 client.
    const init26 = await rpc({ jsonrpc: '2.0', id: 9, method: 'initialize', ...m26, params: {} }, null);
    ok('initialize @2026 advertises the tasks extension capability', !!init26.json?.result?.capabilities?.['io.modelcontextprotocol/tasks']);
    const init25 = await rpc({ jsonrpc: '2.0', id: 10, method: 'initialize', params: {} }, null);
    ok('initialize @2025 does NOT advertise the tasks extension', init25.json?.result?.capabilities?.['io.modelcontextprotocol/tasks'] === undefined);
  });

  it('Idempotency — window expiry re-executes (§16.3)', async () => {
    await clearAbuse(mem.principal);
    await deleteNotesFor(mem.userId);
    await clearIdempotencyFor(mem.principal);
    await setConstant('MCP_CONFIG', JSON.stringify({ defaults: { idempotency_window_seconds: 1 } }));
    {
      const key = 'cov-idemexp-' + mem.userId;
      await callTool(mem.rawToken, 'test_write', { label: 'exp' }, { idempotencyKey: key });
      await new Promise(r => setTimeout(r, 2000)); // let the idempotency record expire
      await callTool(mem.rawToken, 'test_write', { label: 'exp' }, { idempotencyKey: key });
      const rows = (await notesFor(mem.userId)).filter(x => x.source === 'test_write');
      ok('after window expiry, same key RE-executes (2 rows)', rows.length === 2, 'rows=' + rows.length);
    }
    await unsetConstant('MCP_CONFIG');
  });

  // ==== Tier 3: operator / token WEB CONSOLE flows ===============================

  it('Operator console — web authz gating (§5.1)', async () => {
    await sessionLogin(mem); // member is NOT an operator
    const adminRes = await webGet('mcp-admin');
    ok('non-operator GET /mcp-admin → 403', adminRes.status === 403, 'status=' + adminRes.status);
    const expRes = await webGet('mcp-admin/ledger-export.json');
    ok('non-operator GET /mcp-admin/ledger-export.json → 403', expRes.status === 403, 'status=' + expRes.status);
  });

  it('Access lifecycle — request → grant → mint → revoke (§5)', async () => {
    await purgeUserRecords(out.userId); // outsider starts with no access row
    await sessionLogin(out);
    let tools = await (await webGet('mcp-tools')).text();
    ok('no-access user sees "Request access"', /Request access/i.test(tools));
    await webPost('mcp-tools/request', { authenticity_token: _formTok(tools) });
    ok('request → mcp_access status=requested', (await accessRowFor(out.userId))?.status === 'requested');

    await operatorLogin(op);
    let adminPage = await (await webGet('mcp-admin')).text();
    await webPost('mcp-admin/access', { authenticity_token: _formTok(adminPage), decision: 'make_user', user_id: out.userId, email: out.email });
    const granted = await accessRowFor(out.userId);
    ok('operator grant → access active, role user', granted?.status === 'active' && granted?.role === 'user', JSON.stringify(granted));

    await sessionLogin(out);
    tools = await (await webGet('mcp-tools')).text();
    ok('granted user now sees the mint form', /mcp-tools\/mint/.test(tools));
    const before = (await tokensFor(out.userId)).length;
    await webPost('mcp-tools/mint', { authenticity_token: _formTok(tools), label: 'ci-web-mint' });
    ok('mint → a new token row for the user', (await tokensFor(out.userId)).length === before + 1);

    await operatorLogin(op);
    adminPage = await (await webGet('mcp-admin')).text();
    await webPost('mcp-admin/access', { authenticity_token: _formTok(adminPage), decision: 'revoke', user_id: out.userId, email: out.email });
    ok('operator revoke → access revoked', (await accessRowFor(out.userId))?.status === 'revoked');
  });

  it('Token console — IDOR revoke guard (§20)', async () => {
    await sessionLogin(mem);
    let memTools = await (await webGet('mcp-tools')).text();
    ok('member (approved) sees the mint form', /mcp-tools\/mint/.test(memTools));
    await webPost('mcp-tools/mint', { authenticity_token: _formTok(memTools), label: 'idor-victim' });
    const victim = (await tokensFor(mem.userId)).find(t => t.label === 'idor-victim' && t.status === 'active');
    ok('member minted a token', !!victim);
    await operatorLogin(op);
    const opTools = await (await webGet('mcp-tools')).text();
    await webPost('mcp-tools/revoke', { authenticity_token: _formTok(opTools), id: victim?.id });
    ok('IDOR: another user (even an operator) CANNOT revoke your token', (await tokensFor(mem.userId)).find(t => t.id === victim?.id)?.status === 'active');
    await sessionLogin(mem);
    memTools = await (await webGet('mcp-tools')).text();
    await webPost('mcp-tools/revoke', { authenticity_token: _formTok(memTools), id: victim?.id });
    ok('owner CAN revoke their own token', (await tokensFor(mem.userId)).find(t => t.id === victim?.id)?.status === 'revoked');
  });

  it('Ledger export — operator JSON (§9.6)', async () => {
    await operatorLogin(op);
    const res = await webGet('mcp-admin/ledger-export.json');
    ok('operator GET ledger-export.json → 200', res.status === 200, 'status=' + res.status);
    let j = null; try { j = JSON.parse(await res.text()); } catch {}
    ok('export is JSON with rows[] + count + capped flag', j && Array.isArray(j.rows) && typeof j.count === 'number' && ('capped' in j), Object.keys(j || {}).join(','));
    let jf = null; try { jf = JSON.parse(await (await webGet('mcp-admin/ledger-export.json?execution_outcome=success')).text()); } catch {}
    ok('export honors a filter param (echoed)', jf?.filter?.execution_outcome === 'success', 'filter=' + JSON.stringify(jf?.filter));
  });
});
