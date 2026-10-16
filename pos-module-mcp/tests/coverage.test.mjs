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
import { createHash } from 'node:crypto';
import { loadEnv, makeAdmin, pruneRate } from './fixtures.mjs';
import { makeMcp, makeModern, makeConstants, makeWeb, TASKS_CAPABILITY } from './lib/harness.mjs';
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
async function rolesFor(userId) {
  const r = await adm.gql(`{ records(per_page: 1, filter: { table: { value: "modules/user/profile" } properties: [{ name: "user_id", value: "${userId}" }] }) { results { roles: property_array(name: "roles") } } }`);
  return r?.data?.records?.results?.[0]?.roles || [];
}
async function tokensFor(userId) {
  const r = await adm.gql(`{ records(per_page: 50, filter: { table: { value: "modules/mcp/mcp_token" } properties: [{ name: "user_id", value: "${userId}" }] }) { results { id label: property(name: "label") status: property(name: "status") } } }`);
  return r?.data?.records?.results || [];
}
// Remove a user's WEB-FLOW-created token rows (mint creates rows the fixtures don't track).
// SKIPS seeded fixture ids — those persist and are re-baselined by applyReset (which also
// restores each fixture profile's roles).
async function purgeUserRecords(userId) {
  for (const t of await tokensFor(userId)) { if (SEEDED.has(String(t.id))) continue; try { await adm.recordDelete('modules/mcp/mcp_token', t.id); } catch {} }
}

// ---- fixture handles (resolved in beforeAll) ----
let op, mem, out, rate, abuseA, abuseB, abuseC, validator, narrowTok, revokeTok;

describe('coverage · multi-principal governance planes', () => {
  beforeAll(async () => {
    await setConstant('MCP_ENABLE_TEST_TOOLS', 'true');
    // Deterministic fixtures (TASK-5): (re-)import the fixed users/profiles/tokens to baseline.
    await applyReset(adm.gql);
    op = FIXT.users.operator; mem = FIXT.users.member; out = FIXT.users.outsider;
    rate = FIXT.users.rate; abuseA = FIXT.users.abuseA; abuseB = FIXT.users.abuseB; abuseC = FIXT.users.abuseC; validator = FIXT.users.validator;
    narrowTok = mem.tokens.find(t => t.label === 'fixt-narrow');   // pre-seeded, allowed_tools:[test_public]
    revokeTok = mem.tokens.find(t => t.label === 'fixt-revoke');   // pre-seeded, revoked+reset per run
  });

  afterAll(async () => {
    // ---- reset transient state + restore fixtures to baseline (no user teardown) ----
    await unsetConstant('MCP_CONFIG');
    const principals = [op, mem, out, rate, abuseA, abuseB, abuseC, validator];
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
      ok('principal: outsider (token without MCP access) is listed as anonymous', !tiers.some(t => outN.includes(t)), outN.filter(n => n.startsWith('test_')).join(','));
      ok('principal: anon sees NO test tiers', !tiers.some(t => anonN.includes(t)), anonN.filter(n => n.startsWith('test_')).join(','));
    }
    await unsetConstant('MCP_CONFIG');
  });

  it('Authorization — deny path (§12)', async () => {
    ok('member → test_member allowed', isOkResult(await callTool(mem.rawToken, 'test_member', {})));
    const outsider = await callTool(out.rawToken, 'test_member', {});
    ok('outsider (no MCP role) → token rejected, 401', outsider.status === 401 && outsider.json?.error?.code === -32001, 'status=' + outsider.status);
    ok('member → test_admin DENIED', isDenied(await callTool(mem.rawToken, 'test_admin', {})));
    {
      const led = await ledgerFor(mem.principal);
      ok('deny is attested in the ledger', led.some(x => x.authz === 'deny' && x.tool === 'test_admin'));
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
      ok('same key + different args → -32602 with HTTP 200', conflict.status === 200 && conflict.json?.error?.code === -32602, `status=${conflict.status} code=${conflict.json?.error?.code}`);
      // Both fixtures take {} → identical input_sha256. Keys are scoped per tool: the
      // same key on another tool runs that tool fresh — never replays tool A's result.
      const xkey = 'cov-idem-x-' + mem.userId;
      ok('idempotent tool A with key → ok', isOkResult(await callTool(mem.rawToken, 'test_public', {}, { idempotencyKey: xkey })));
      const cross = await callTool(mem.rawToken, 'test_member', {}, { idempotencyKey: xkey });
      const crossTxt = JSON.stringify(cross.json?.result || {});
      ok('same key + same args on a DIFFERENT tool → runs that tool (no cross-tool replay)', isOkResult(cross) && crossTxt.includes('"tier":"member"') && !crossTxt.includes('"tier":"public"'), crossTxt.slice(0, 200));
    }
    {
      // Concurrent retries: both in flight before either commits. The ledger mutex +
      // locked re-check must let exactly one execute; the other replays.
      await deleteNotesFor(mem.userId);
      const ckey = 'cov-idem-c-' + mem.userId;
      const [c1, c2] = await Promise.all([
        callTool(mem.rawToken, 'test_write', { label: 'race' }, { idempotencyKey: ckey }),
        callTool(mem.rawToken, 'test_write', { label: 'race' }, { idempotencyKey: ckey }),
      ]);
      ok('concurrent same-key calls both succeed', isOkResult(c1) && isOkResult(c2), `s1=${c1.status} s2=${c2.status}`);
      const rows = (await notesFor(mem.userId)).filter(x => x.source === 'test_write' && x.label === 'race');
      ok('concurrent same-key calls → exactly one row written', rows.length === 1, 'rows=' + rows.length);
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

  it('Approval — a token revoked after the request does not run on approval (§9.6)', async () => {
    await clearPendingFor(mem.principal);
    await deleteNotesFor(mem.userId);
    await recordUpdate('modules/mcp/mcp_token', revokeTok.id, { status: 'active' });
    try {
      await callTool(revokeTok.raw, 'test_approve', { label: 'revokedreq' });
      const pend = await pendingRecordsFor(mem.principal);
      ok('one pending queued by the soon-revoked token', pend.length === 1, 'pending=' + pend.length);
      await recordUpdate('modules/mcp/mcp_token', revokeTok.id, { status: 'revoked' });
      await operatorLogin(op);
      const adminPage = await (await webGet('mcp-admin')).text();
      await webPost('mcp-admin/approve', { authenticity_token: _formTok(adminPage), handle: pend[0]?.handle });
      const rows = (await notesFor(mem.userId)).filter(x => x.source === 'test_approve' && x.label === 'revokedreq');
      ok('approval of a revoked requester does NOT execute', rows.length === 0, 'rows=' + rows.length);
      const st = (await adm.gql(`{ records(per_page: 1, filter: { table: { value: "${T_PENDING}" } id: { value: "${pend[0]?.id}" } }) { results { status: property(name: "status") summary: property(name: "result_summary") } } }`))?.data?.records?.results?.[0];
      ok('approval is failed with "access was revoked"', st?.status === 'failed' && /access was revoked/.test(st?.summary || ''), JSON.stringify(st));
    } finally {
      await recordUpdate('modules/mcp/mcp_token', revokeTok.id, { status: 'active' }); // seeded baseline; the lifecycle test revokes it later
      await clearPendingFor(mem.principal);
    }
  });

  it('Approval — concurrent approves execute exactly once (§9.6)', async () => {
    await clearPendingFor(mem.principal);
    await deleteNotesFor(mem.userId);
    await callTool(mem.rawToken, 'test_approve', { label: 'raceme' });
    {
      const pend = await pendingRecordsFor(mem.principal);
      const handle = pend[0]?.handle;
      ok('operator reaches the console (login ok)', await operatorLogin(op));
      const tok = _formTok(await (await webGet('mcp-admin')).text());
      // Double-click / two operators: fire the approvals together.
      const res = await Promise.all([1, 2, 3].map(() => webPost('mcp-admin/approve', { authenticity_token: tok, handle })));
      ok('all approve POSTs accepted', res.every(r => r.status === 302 || r.status === 200), res.map(r => r.status).join(','));
      const rows = (await notesFor(mem.userId)).filter(x => x.source === 'test_approve' && x.label === 'raceme');
      ok('action executed EXACTLY once', rows.length === 1, 'rows=' + rows.length);
    }
  });

  it('Approval — bulk reject drains one principal (§9.6)', async () => {
    await clearPendingFor(mem.principal);
    await deleteNotesFor(mem.userId);
    await callTool(mem.rawToken, 'test_approve', { label: 'bulk1' });
    await callTool(mem.rawToken, 'test_approve', { label: 'bulk2' });
    {
      ok('two pending queued', (await pendingFor(mem.principal)).length === 2, 'pending=' + (await pendingFor(mem.principal)).length);
      ok('operator reaches the console (login ok)', await operatorLogin(op));
      const tok = _formTok(await (await webGet('mcp-admin')).text());
      const r = await webPost('mcp-admin/reject-principal', { authenticity_token: tok, principal_id: mem.principal });
      ok('reject-principal POST accepted', r.status === 302 || r.status === 200, 'status=' + r.status);
      ok('no pending left for the principal', (await pendingFor(mem.principal)).length === 0, 'pending=' + (await pendingFor(mem.principal)).length);
      ok('bulk-rejected actions never executed', (await notesFor(mem.userId)).filter(x => x.source === 'test_approve').length === 0);
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

  it('Token lifecycle — a token stops working when its user loses MCP access by any path (§9)', async () => {
    // Not through the console (which revokes tokens itself): edit the profile directly,
    // as a user-module admin or another app flow would. The token row stays active.
    const profile = (await adm.gql(`{ records(per_page: 1, filter: { table: { value: "modules/user/profile" } properties: [{ name: "user_id", value: "${validator.userId}" }] }) { results { id } } }`))?.data?.records?.results?.[0];
    const setRoles = (roles) => adm.gql(`mutation { record_update(id: ${profile.id}, record: { table: "modules/user/profile" properties: [{ name: "roles", value_array: ${JSON.stringify(roles)} }] }) { id } }`);
    try {
      ok('token works while the user holds mcp_user', isOkResult(await callTool(validator.rawToken, 'test_public', {})));
      await setRoles([]);
      const after = await callTool(validator.rawToken, 'test_public', {});
      ok('role removed outside the console → 401, though the token row is still active', after.status === 401 && after.json?.error?.code === -32001, 'status=' + after.status);
    } finally {
      await setRoles(['mcp_user']);
    }
    ok('role restored → the same token works again', isOkResult(await callTool(validator.rawToken, 'test_public', {})));
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
    const q = `{ records(per_page: 1, filter: { table: { value: "${T_LEDGER}" } }, sort: [{ id: { order: DESC } }]) { results { id outcome: property(name: "execution_outcome") version: property(name: "canonical_version") } } }`;
    const row = (await adm.gql(q))?.data?.records?.results?.[0];
    ok('new ledger rows record their hash format (canonical_version 1)', String(row?.version) === '1', 'canonical_version=' + row?.version);
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
    const rej = (r) => r.status === 200 && r.json?.result?.isError === true && Array.isArray(r.json.result.structuredContent?.validation_errors);
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
    ok('format date: a real calendar day accepted (leap day 2024-02-29)', isOkResult(await V({ ...valid, day: '2024-02-29' })));
    await bad('format date: impossible day rejected (2026-02-31)', { day: '2026-02-31' });
    await bad('format date: not a leap year rejected (1900-02-29)', { day: '1900-02-29' });
    await bad('format date: month 13 rejected', { day: '2026-13-01' });
    await bad('format date: unpadded value rejected', { day: '2026-1-5' });
    await bad('format date: date-time value rejected', { day: '2026-01-05T10:00:00Z' });
    await bad('array: minItems rejected', { tags: [] });
    await bad('array: maxItems rejected', { tags: ['a', 'b', 'c', 'd'] });
    await bad('array: item type rejected', { tags: [1, 2] });
    await bad('string: minLength rejected', { code: 'a' });
    await bad('string: pattern rejected', { code: 'AB' });
    ok('additionalProperties:false → unknown key rejected', rej(await V({ ...valid, surprise: 1 })));
  });

  it('Handler identity — the agent carries the calling token (agent.token_id)', async () => {
    const r = await callTool(mem.rawToken, 'test_echo', { message: 'who am i' });
    const txt = JSON.stringify(r.json?.result || {});
    ok('handler gets agent.token_id = the token that made the call', txt.includes(`"agent_token_id":"${mem.tokenId}"`), txt.slice(0, 300));
    ok('handler gets agent.client_id = the manual token label', txt.includes('"agent_client_id":"fixt-member"'), txt.slice(0, 300));
  });

  it('Rate limiting — per-principal isolation (§12.4)', async () => {
    await setConstant('MCP_CONFIG', JSON.stringify({ defaults: { rate_limit_per_min: 3 } }));
    await pruneRate(adm, rate.principal);
    await pruneRate(adm, op.principal);
    {
      const codes = [];
      for (let i = 0; i < 5; i++) { const r = await callTool(rate.rawToken, 'test_public', {}); codes.push(r.json?.error?.code ?? r.status); }
      ok('a principal exhausts its own limit → -32004', codes.slice(0, 3).every(c => c === 200) && codes.slice(3).some(c => c === -32004), codes.join(','));
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

  it('tools/list — title, annotations and outputSchema come from the manifest; invalid ones are excluded', async () => {
    const r = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }, mem.rawToken);
    const tools = r.json?.result?.tools || [];
    const se = tools.find(t => t.name === 'search_events');
    ok('search_events carries its title', se?.title === 'Search events', String(se?.title));
    ok('search_events carries all four annotation hints as declared', JSON.stringify(se?.annotations) === JSON.stringify({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }), JSON.stringify(se?.annotations));
    ok('search_events carries its outputSchema, nullable fields included', se?.outputSchema?.type === 'object' && JSON.stringify(se?.outputSchema?.properties?.events?.items?.properties?.venue?.type) === JSON.stringify(['string', 'null']), JSON.stringify(se?.outputSchema || {}).slice(0, 160));
    const plain = tools.find(t => t.name === 'test_public');
    ok('a tool that declares none of them carries none', plain && plain.title === undefined && plain.annotations === undefined && plain.outputSchema === undefined);
    ok('a malformed annotation excludes the tool from tools/list', tools.length > 0 && !tools.some(t => t.name === 'test_bad_annotations'), tools.map(t => t.name).join(','));
    const call = await callTool(mem.rawToken, 'test_bad_annotations', {});
    ok('the excluded tool cannot be called', call.json?.error?.code === -32602 || call.json?.result?.isError === true, JSON.stringify(call.json?.error || call.json?.result || {}).slice(0, 120));
  });

  it('tools/list — a malformed cursor starts from the first page', async () => {
    const first = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }, mem.rawToken);
    const firstNames = (first.json?.result?.tools || []).map(t => t.name).join(',');
    for (const cursor of ['###not-base64###', 'YQ', '=?bad?=']) {
      const r = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: { cursor } }, mem.rawToken);
      ok(`cursor ${JSON.stringify(cursor)} → 200 with the first page`, r.status === 200 && (r.json?.result?.tools || []).map(t => t.name).join(',') === firstNames, `status=${r.status}`);
    }
    const valid = await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/list', params: { cursor: Buffer.from('offset:1').toString('base64') } }, mem.rawToken);
    ok('a valid cursor still pages (offset 1 skips the first tool)', valid.status === 200 && (valid.json?.result?.tools || [])[0]?.name === (first.json?.result?.tools || [])[1]?.name);
  });

  // ── Tasks extension (io.modelcontextprotocol/tasks) over the approval gate ──────────
  // An approval-gated tools/call is a task for a modern client that declares the
  // extension: CreateTaskResult, then tasks/get / tasks/update / tasks/cancel.
  const TASK_ID = /^mcp_pa_[0-9a-f]{32}$/;
  const isIso = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([+-]\d{2}:\d{2}|Z)$/.test(v) && !Number.isNaN(Date.parse(v));
  const modernClient = () => makeModern(base).send;
  async function createTask(send, label) {
    const r = await send('tools/call', { name: 'test_approve', arguments: { label } }, { token: mem.rawToken, capabilities: TASKS_CAPABILITY });
    return { res: r, taskId: r.json?.result?.taskId };
  }
  const getTask = (send, taskId, token = mem.rawToken) => send('tasks/get', { taskId }, { token, capabilities: TASKS_CAPABILITY });
  // The operator signs in once per test (operatorLogin); each decision reuses the session.
  async function decide(action, handle) {
    const tok = _formTok(await (await webGet('mcp-admin?tab=approvals')).text());
    const res = await webPost('mcp-admin/' + action, { authenticity_token: tok, handle });
    return res.status === 302 || res.status === 200;
  }

  it('Tasks — tools/call answers with a task only when the request declares the extension', async () => {
    const send = modernClient();
    await clearAbuse(mem.principal);
    await clearPendingFor(mem.principal);
    await deleteNotesFor(mem.userId);

    const legacy = await callTool(mem.rawToken, 'test_approve', { label: 'task-legacy' });
    const lsc = legacy.json?.result?.structuredContent || {};
    ok('legacy client → pending CallToolResult with a handle', lsc.status === 'pending_approval' && TASK_ID.test(lsc.handle || ''), JSON.stringify(lsc).slice(0, 120));
    ok('legacy pending result carries no taskId and no resultType', lsc.taskId === undefined && legacy.json?.result?.resultType === undefined);

    const plain = await send('tools/call', { name: 'test_approve', arguments: { label: 'task-plain' } }, { token: mem.rawToken });
    ok('modern client without the extension → pending CallToolResult, resultType complete', plain.json?.result?.resultType === 'complete' && plain.json?.result?.structuredContent?.status === 'pending_approval' && plain.json?.result?.structuredContent?.taskId === undefined, plain.text.slice(0, 160));
    await clearPendingFor(mem.principal);

    const { res, taskId } = await createTask(send, 'task-create');
    const t = res.json?.result || {};
    ok('declaring client → CreateTaskResult (resultType task)', res.status === 200 && t.resultType === 'task', res.text.slice(0, 200));
    ok('taskId is the opaque 128-bit handle', TASK_ID.test(taskId || ''), taskId);
    ok('seed status working with a statusMessage', t.status === 'working' && typeof t.statusMessage === 'string' && t.statusMessage.length > 0);
    ok('createdAt / lastUpdatedAt are ISO 8601', isIso(t.createdAt) && isIso(t.lastUpdatedAt), `${t.createdAt} ${t.lastUpdatedAt}`);
    ok('ttlMs present and null (rows are kept)', 'ttlMs' in t && t.ttlMs === null);
    ok('pollIntervalMs from config (30000)', t.pollIntervalMs === 30000, String(t.pollIntervalMs));
    ok('no tool content on a task handle', t.content === undefined && t.result === undefined);
    ok('_meta names the tool and the approval deadline', t._meta?.['com.platformos.mcp/approval']?.tool === 'test_approve' && isIso(t._meta?.['com.platformos.mcp/approval']?.expiresAt));
    ok('nothing executed before approval', (await notesFor(mem.userId)).filter(x => x.source === 'test_approve').length === 0);

    const g = await getTask(send, taskId);
    ok('tasks/get right away resolves the task (durable before the answer)', g.status === 200 && g.json?.result?.taskId === taskId && g.json?.result?.status === 'working', g.text.slice(0, 160));
    ok('tasks/get result has resultType complete', g.json?.result?.resultType === 'complete');
    await clearPendingFor(mem.principal);
  });

  it('Tasks — capability, headers, authentication and self-scoping on tasks/*', async () => {
    const send = modernClient();
    await clearAbuse(mem.principal);
    await clearPendingFor(mem.principal);
    const { taskId } = await createTask(send, 'task-scope');

    const undeclared = await send('tasks/get', { taskId }, { token: mem.rawToken });
    ok('tasks/get without the extension declared → 400 -32021', undeclared.status === 400 && undeclared.json?.error?.code === -32021, `status=${undeclared.status} code=${undeclared.json?.error?.code}`);
    ok('-32021 names the required extension', JSON.stringify(undeclared.json?.error?.data?.requiredCapabilities) === JSON.stringify({ extensions: { 'io.modelcontextprotocol/tasks': {} } }));
    const undeclaredCancel = await send('tasks/cancel', { taskId }, { token: mem.rawToken });
    ok('tasks/cancel without the extension declared → -32021', undeclaredCancel.json?.error?.code === -32021);
    const legacy = await rpc({ jsonrpc: '2.0', id: 1, method: 'tasks/get', params: { taskId } }, mem.rawToken);
    ok('legacy tasks/get → -32601 (method not found)', legacy.json?.error?.code === -32601, 'code=' + legacy.json?.error?.code);

    const noName = await send('tasks/get', { taskId }, { token: mem.rawToken, capabilities: TASKS_CAPABILITY, omitHeaders: ['Mcp-Name'] });
    ok('tasks/get without Mcp-Name → 400 -32020', noName.status === 400 && noName.json?.error?.code === -32020);
    const wrongName = await send('tasks/get', { taskId }, { token: mem.rawToken, capabilities: TASKS_CAPABILITY, headers: { 'Mcp-Name': 'mcp_pa_other' } });
    ok('Mcp-Name different from taskId → 400 -32020', wrongName.status === 400 && wrongName.json?.error?.code === -32020);

    const anon = await send('tasks/get', { taskId }, { capabilities: TASKS_CAPABILITY });
    ok('no bearer → 401 -32001', anon.status === 401 && anon.json?.error?.code === -32001, `status=${anon.status}`);
    const other = await getTask(send, taskId, op.rawToken);
    ok("another principal's task → -32602 Task not found", other.json?.error?.code === -32602 && other.json?.error?.message === 'Task not found');
    const unknown = await getTask(send, 'mcp_pa_' + '0'.repeat(32));
    ok('unknown task → the same -32602 Task not found (no probing)', unknown.json?.error?.code === -32602 && unknown.json?.error?.message === 'Task not found');
    const otherCancel = await send('tasks/cancel', { taskId }, { token: op.rawToken, capabilities: TASKS_CAPABILITY });
    ok("another principal cannot cancel it (-32602)", otherCancel.json?.error?.code === -32602);
    ok('the task is still working after the foreign cancel', (await getTask(send, taskId)).json?.result?.status === 'working');

    // SECURITY: tasks/update only carries input answers; it can never decide the task.
    const upd = await send('tasks/update', { taskId, status: 'approved', inputResponses: { k1: { action: 'accept' } } }, { token: mem.rawToken, capabilities: TASKS_CAPABILITY });
    ok('tasks/update → empty acknowledgement (resultType complete)', upd.status === 200 && JSON.stringify(upd.json?.result) === JSON.stringify({ resultType: 'complete' }), upd.text.slice(0, 120));
    ok('tasks/update cannot approve: still working, nothing executed', (await getTask(send, taskId)).json?.result?.status === 'working' && (await notesFor(mem.userId)).filter(x => x.label === 'task-scope').length === 0);
    const updOther = await send('tasks/update', { taskId, inputResponses: {} }, { token: op.rawToken, capabilities: TASKS_CAPABILITY });
    ok("tasks/update on another principal's task → -32602", updOther.json?.error?.code === -32602);
    await clearPendingFor(mem.principal);
  });

  it('Tasks — tasks/cancel withdraws a pending action, idempotently', async () => {
    const send = modernClient();
    await clearAbuse(mem.principal);
    await clearPendingFor(mem.principal);
    await deleteNotesFor(mem.userId);
    const { taskId } = await createTask(send, 'task-cancel');

    const c1 = await send('tasks/cancel', { taskId }, { token: mem.rawToken, capabilities: TASKS_CAPABILITY });
    ok('tasks/cancel → empty acknowledgement', c1.status === 200 && JSON.stringify(c1.json?.result) === JSON.stringify({ resultType: 'complete' }), c1.text.slice(0, 120));
    const after = (await getTask(send, taskId)).json?.result || {};
    ok('task is cancelled with an explanation', after.status === 'cancelled' && /withdrew/.test(after.statusMessage || ''), JSON.stringify(after).slice(0, 160));
    ok('cancelled task carries neither result nor error', after.result === undefined && after.error === undefined);
    ok('cancel frees the pending queue slot', (await pendingFor(mem.principal)).length === 0);
    const c2 = await send('tasks/cancel', { taskId }, { token: mem.rawToken, capabilities: TASKS_CAPABILITY });
    ok('cancelling again is still acknowledged and changes nothing', c2.status === 200 && (await getTask(send, taskId)).json?.result?.status === 'cancelled');
    ok('operator reaches the console (login ok)', await operatorLogin(op));
    ok('approving a cancelled task does nothing', (await decide('approve', taskId)) && (await notesFor(mem.userId)).filter(x => x.label === 'task-cancel').length === 0 && (await getTask(send, taskId)).json?.result?.status === 'cancelled');
    await clearPendingFor(mem.principal);
  });

  it('Tasks — operator decisions: approve → completed with the tool result, reject → cancelled', async () => {
    const send = modernClient();
    await clearAbuse(mem.principal);
    await clearPendingFor(mem.principal);
    await deleteNotesFor(mem.userId);

    const { taskId } = await createTask(send, 'task-approve');
    ok('operator reaches the console (login ok)', await operatorLogin(op));
    ok('operator approves through the console', await decide('approve', taskId));
    const done = (await getTask(send, taskId)).json?.result || {};
    ok('task completed', done.status === 'completed', JSON.stringify(done).slice(0, 200));
    ok('result is the tool result (isError false, structuredContent from the handler)', done.result?.isError === false && Array.isArray(done.result?.content) && done.result?.structuredContent?.label === 'task-approve' && done.result?.structuredContent?.owner === mem.principal, JSON.stringify(done.result || {}).slice(0, 200));
    ok('lastUpdatedAt moved on from createdAt', Date.parse(done.lastUpdatedAt) >= Date.parse(done.createdAt));
    ok('the action ran once, as the requester', (await notesFor(mem.userId)).filter(x => x.label === 'task-approve').length === 1);

    const rej = await createTask(send, 'task-reject');
    ok('operator rejects through the console', await decide('reject', rej.taskId));
    const rejected = (await getTask(send, rej.taskId)).json?.result || {};
    ok('rejected → cancelled with the reason', rejected.status === 'cancelled' && /rejected/.test(rejected.statusMessage || ''), JSON.stringify(rejected).slice(0, 160));
    ok('rejected action never ran', (await notesFor(mem.userId)).filter(x => x.label === 'task-reject').length === 0);
    await clearPendingFor(mem.principal);
  });

  it('Tasks — failures: tool gone → failed with the JSON-RPC error, handler error → completed isError, expired → failed -32005', async () => {
    const send = modernClient();
    await clearAbuse(mem.principal);
    await clearPendingFor(mem.principal);
    await deleteNotesFor(mem.userId);
    ok('operator reaches the console (login ok)', await operatorLogin(op));
    const recId = async (handle) => (await adm.gql(`{ records(per_page: 1, filter: { table: { value: "${T_PENDING}" } properties: [{ name: "handle", value: "${handle}" }] }) { results { id } } }`))?.data?.records?.results?.[0]?.id;

    const gone = await createTask(send, 'task-gone');
    await recordUpdate(T_PENDING, await recId(gone.taskId), { tool_name: 'no_such_tool' });
    await decide('approve', gone.taskId);
    const g = (await getTask(send, gone.taskId)).json?.result || {};
    ok('tool removed before approval → failed with -32602 Unknown tool', g.status === 'failed' && g.error?.code === -32602 && g.error?.message === 'Unknown tool' && g.result === undefined, JSON.stringify(g).slice(0, 200));

    const broken = await createTask(send, 'task-handler-error');
    await recordUpdate(T_PENDING, await recId(broken.taskId), { tool_name: 'test_fail' });
    await decide('approve', broken.taskId);
    const b = (await getTask(send, broken.taskId)).json?.result || {};
    ok('handler failure → completed with an isError tool result (not failed)', b.status === 'completed' && b.result?.isError === true && Array.isArray(b.result?.content) && b.error === undefined, JSON.stringify(b).slice(0, 200));
    ok('the failed handler left no row (rolled back)', (await notesFor(mem.userId)).filter(x => x.label === 'task-handler-error').length === 0);

    const late = await createTask(send, 'task-expired');
    const lateId = await recId(late.taskId);
    const past = Math.floor(Date.now() / 1000) - 60;
    await adm.gql(`mutation { record_update(id: ${lateId}, record: { table: "${T_PENDING}" properties: [{ name: "expires_at", value_int: ${past} }] }) { id } }`);
    const e = (await getTask(send, late.taskId)).json?.result || {};
    ok('pending past its window → failed with -32005', e.status === 'failed' && e.error?.code === -32005, JSON.stringify(e).slice(0, 200));
    await decide('approve', late.taskId);
    const e2 = (await getTask(send, late.taskId)).json?.result || {};
    ok('approving after the window still reports expired, nothing ran', e2.status === 'failed' && e2.error?.code === -32005 && (await notesFor(mem.userId)).filter(x => x.label === 'task-expired').length === 0);
    await clearPendingFor(mem.principal);
  });

  // platformOS parse_json decodes HTML entities before parsing unless raw_text: true is
  // passed: stored JSON holding "&quot;" failed to parse and "&amp;" came back as "&".
  it('Text with HTML entities survives every stored JSON round trip: arguments, replay, approval, task', async () => {
    const send = modernClient();
    const TEXT = 'Tom &amp; Jerry say &quot;hi&quot; &lt;b&gt; &#39;q&#39;';
    const TASK_TEXT = TEXT + ' task';
    await clearAbuse(mem.principal);
    await clearPendingFor(mem.principal);
    await clearIdempotencyFor(mem.principal);
    await deleteNotesFor(mem.userId);

    const echo = await callTool(mem.rawToken, 'test_echo', { message: TEXT });
    ok('tools/call arguments reach the handler unchanged', isOkResult(echo) && echo.json?.result?.structuredContent?.echo === TEXT, (echo.text || '').slice(0, 200));

    const key = 'cov-entities-' + mem.userId;
    const first = await callTool(mem.rawToken, 'test_write', { label: TEXT }, { idempotencyKey: key });
    const replay = await callTool(mem.rawToken, 'test_write', { label: TEXT }, { idempotencyKey: key });
    const written = (await notesFor(mem.userId)).filter(x => x.source === 'test_write');
    ok('the write stores the text unchanged', isOkResult(first) && written.length === 1 && written[0].label === TEXT, JSON.stringify(written));
    ok('the idempotent replay returns the text unchanged', isOkResult(replay) && replay.json?.result?.structuredContent?.label === TEXT, (replay.text || '').slice(0, 200));

    await callTool(mem.rawToken, 'test_approve', { label: TEXT });
    const handle = (await pendingRecordsFor(mem.principal))[0]?.handle;
    ok('operator reaches the console (login ok)', await operatorLogin(op));
    ok('operator approves the held action', await decide('approve', handle));
    const approved = (await notesFor(mem.userId)).filter(x => x.source === 'test_approve');
    ok('the approved action runs with the text unchanged', approved.length === 1 && approved[0].label === TEXT, JSON.stringify(approved));

    const { taskId } = await createTask(send, TASK_TEXT);
    ok('operator approves the task', await decide('approve', taskId));
    const done = (await getTask(send, taskId)).json?.result || {};
    ok('the task result carries the text unchanged', done.status === 'completed' && done.result?.structuredContent?.label === TASK_TEXT, JSON.stringify(done).slice(0, 240));

    await clearPendingFor(mem.principal);
    await clearIdempotencyFor(mem.principal);
    await deleteNotesFor(mem.userId);
  });

  // The registry is cached as JSON text shared by the JSON endpoint and the HTML console
  // (its Tools & config tab loads it), and Liquid escapes echo output only on HTML pages.
  // Each order of first use gets its
  // own cache entry (a unique MCP_ENABLE_VULN_TOOLS value is part of the key and enables
  // nothing), and the test_echo description, which holds HTML entities, must come back
  // exactly either way.
  it('Registry — tool text with HTML entities is served exactly whichever page filled the cache', async () => {
    const want = 'Text such as &quot;quotes&quot; &amp; &lt;tags&gt; comes back as sent.';
    const echoDescription = async () => {
      const r = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }, mem.rawToken);
      return (r.json?.result?.tools || []).find(t => t.name === 'test_echo')?.description || `(status ${r.status}) ${r.text.slice(0, 120)}`;
    };
    ok('operator reaches the console (login ok)', await operatorLogin(op));
    try {
      await setConstant('MCP_ENABLE_VULN_TOOLS', 'cache-json-first-' + Date.now());
      const jsonFirst = await echoDescription();
      ok('/mcp first: the description is exact', jsonFirst.endsWith(want), jsonFirst);
      ok('the console lists the tools from that cache', (await webGet('mcp-admin?tab=config')).status === 200);
      ok('/mcp again: still exact', (await echoDescription()).endsWith(want));

      await setConstant('MCP_ENABLE_VULN_TOOLS', 'cache-html-first-' + Date.now());
      ok('the console fills the cache first', (await webGet('mcp-admin?tab=config')).status === 200);
      const htmlFirst = await echoDescription();
      ok('/mcp after the console filled the cache: the description is exact', htmlFirst.endsWith(want), htmlFirst);
    } finally {
      await unsetConstant('MCP_ENABLE_VULN_TOOLS');
    }
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

  // ==== App resource provider (§13.1): the test provider in app/lib/mcp/resources ====

  it('Resources — the app provider serves each caller only their own resources (§13.1)', async () => {
    const mine = `test-note://${mem.userId}/hello`;
    const list = (token, cursor) => rpc({ jsonrpc: '2.0', id: 1, method: 'resources/list', params: cursor ? { cursor } : {} }, token);
    const read = (token, uri) => rpc({ jsonrpc: '2.0', id: 2, method: 'resources/read', params: { uri } }, token);
    const templates = (token) => rpc({ jsonrpc: '2.0', id: 3, method: 'resources/templates/list', params: {} }, token);
    // The ledger is append-only, so only rows written after this point count.
    const readLedger = async () => {
      const r = await adm.gql(`{ records(per_page: 50, filter: { table: { value: "${T_LEDGER}" } properties: [{ name: "principal_id", value: "${mem.principal}" }, { name: "method", value: "resources/read" }] }, sort: [{ id: { order: DESC } }]) { results { id outcome: property(name: "execution_outcome") sha: property(name: "input_sha256") } } }`);
      return r?.data?.records?.results || [];
    };
    const ledgerStart = Math.max(0, ...(await readLedger()).map(r => Number(r.id)));

    const anon = await list(null);
    ok('anonymous list → no provider resources', anon.status === 200 && !(anon.json?.result?.resources || []).some(r => r.uri.startsWith('test-note://')), anon.text.slice(0, 160));
    const anonTemplates = await templates(null);
    ok('anonymous templates → empty', Array.isArray(anonTemplates.json?.result?.resourceTemplates) && anonTemplates.json.result.resourceTemplates.length === 0);

    const first = await list(mem.rawToken);
    const firstResources = first.json?.result?.resources || [];
    const hello = firstResources.find(r => r.uri === mine);
    ok("signed-in list → the caller's own resource", !!hello && hello.name === 'hello' && hello.title === 'Hello note' && hello.mimeType === 'text/plain', JSON.stringify(firstResources));
    ok('only the keys MCP defines are listed', !!hello && !('internal' in hello));
    ok('a provider entry with the reserved mcp+page: scheme is dropped', !firstResources.some(r => r.uri === 'mcp+page:///forged'));
    ok('a provider entry without a name is dropped', !firstResources.some(r => r.uri.endsWith('/nameless')));
    ok("the provider's cursor is returned as nextCursor", first.json?.result?.nextCursor === 'page-2', 'nextCursor=' + first.json?.result?.nextCursor);
    const second = await list(mem.rawToken, 'page-2');
    ok("nextCursor pages to the provider's next page", (second.json?.result?.resources || []).map(r => r.uri).join() === `test-note://${mem.userId}/second` && second.json?.result?.nextCursor === undefined, second.text.slice(0, 200));
    // Another caller who holds MCP access (the outsider holds none, so its token is refused).
    const othersList = await list(validator.rawToken);
    ok('another caller lists only their own', othersList.status === 200 && Array.isArray(othersList.json?.result?.resources) && !othersList.json.result.resources.some(r => r.uri.startsWith(`test-note://${mem.userId}/`)), othersList.text.slice(0, 160));

    const signedTemplates = await templates(mem.rawToken);
    ok('signed-in templates → the provider template', (signedTemplates.json?.result?.resourceTemplates || []).some(t => t.uriTemplate === 'test-note://{user_id}/{name}' && t.name === 'test_note'), signedTemplates.text.slice(0, 200));

    const own = await read(mem.rawToken, mine);
    const text = own.json?.result?.contents?.[0]?.text || '';
    ok('the owner reads it; the provider got principal and agent', text === `note hello for ${mem.principal} via fixt-member`, own.text.slice(0, 200));
    const others = await read(validator.rawToken, mine);
    ok('another caller reading it → Resource not found', others.json?.error?.code === -32002 && others.json?.error?.message === 'Resource not found', JSON.stringify(others.json?.error));
    const anonRead = await read(null, mine);
    ok('anonymous read → Resource not found', anonRead.json?.error?.code === -32002);
    const missing = await read(mem.rawToken, `test-note://${mem.userId}/missing`);
    ok('a missing resource → Resource not found', missing.json?.error?.code === -32002);
    const boom = await read(mem.rawToken, `test-note://${mem.userId}/boom`);
    ok('a provider that raises → -32603, nothing of the error leaked', boom.json?.error?.code === -32603 && !/divided|zero|Liquid/i.test(boom.text), boom.text.slice(0, 200));
    const malformed = await read(mem.rawToken, `test-note://${mem.userId}/malformed`);
    ok('malformed provider contents → -32603', malformed.json?.error?.code === -32603, malformed.text.slice(0, 200));
    const innerMissing = await read(mem.rawToken, `test-note://${mem.userId}/inner_missing`);
    ok('a partial missing INSIDE the provider is a failure (-32603), not "no provider"', innerMissing.json?.error?.code === -32603, innerMissing.text.slice(0, 200));

    await setConstant('MCP_CONFIG', JSON.stringify({ resources_partial: 'mcp/no_such_resources' }));
    const noProviderList = await list(mem.rawToken);
    ok('no provider partial → the signed-in list still answers, without provider entries', noProviderList.status === 200 && Array.isArray(noProviderList.json?.result?.resources) && !noProviderList.json.result.resources.some(r => r.uri.startsWith('test-note://')), noProviderList.text.slice(0, 160));
    const noProviderRead = await read(mem.rawToken, mine);
    ok('no provider partial → a provider URI is not found', noProviderRead.json?.error?.code === -32002, noProviderRead.text.slice(0, 160));
    await unsetConstant('MCP_CONFIG');

    const rows = (await readLedger()).filter(r => Number(r.id) > ledgerStart);
    const mineSha = createHash('sha256').update(mine).digest('hex');
    ok('a provider read is in the ledger with the URI hashed', rows.some(r => r.outcome === 'success' && r.sha === mineSha), JSON.stringify(rows.slice(0, 4)));
    ok('a not-found read is in the ledger as invalid', rows.some(r => r.outcome === 'invalid'));
    ok('a failed provider read is in the ledger as error', rows.some(r => r.outcome === 'error'));
  });

  it('Resources — modern caching is private for a signed-in caller; reads share the rate limit (§13.1, §12.4)', async () => {
    const send = modernClient();
    const mine = `test-note://${mem.userId}/hello`;
    for (const m of ['resources/list', 'resources/templates/list']) {
      const r = await send(m, {}, { token: mem.rawToken });
      ok(`signed-in ${m} → cacheScope private`, r.json?.result?.cacheScope === 'private', `scope=${r.json?.result?.cacheScope}`);
    }
    const read = await send('resources/read', { uri: mine }, { token: mem.rawToken });
    ok('provider read → resultType complete + cacheScope private', read.json?.result?.resultType === 'complete' && read.json?.result?.cacheScope === 'private', read.text.slice(0, 200));
    const notFound = await send('resources/read', { uri: mine }, { token: validator.rawToken });
    ok('modern not found → -32602', notFound.json?.error?.code === -32602, 'code=' + notFound.json?.error?.code);

    const rateUri = `test-note://${rate.userId}/hello`;
    await pruneRate(adm, rate.principal);
    await setConstant('MCP_CONFIG', JSON.stringify({ defaults: { rate_limit_per_min: 2 } }));
    const reads = [];
    for (let i = 0; i < 3; i++) reads.push(await rpc({ jsonrpc: '2.0', id: 10 + i, method: 'resources/read', params: { uri: rateUri } }, rate.rawToken));
    ok('reads within the limit succeed', reads[0].status === 200 && reads[1].status === 200 && !!reads[1].json?.result, reads.map(r => r.status).join(','));
    ok('the read over the limit → 429 -32002 with Retry-After', reads[2].status === 429 && reads[2].json?.error?.code === -32002 && !!reads[2].headers.get('retry-after'), `status=${reads[2].status}`);
    const modernOver = await send('resources/read', { uri: rateUri }, { token: rate.rawToken });
    ok('modern rate limit keeps -32002 (not mapped to not found)', modernOver.status === 429 && modernOver.json?.error?.code === -32002, `status=${modernOver.status} code=${modernOver.json?.error?.code}`);
    await unsetConstant('MCP_CONFIG');
    await pruneRate(adm, rate.principal);
  });

  // ==== Tier 3: operator / token WEB CONSOLE flows ===============================

  it('Operator console — web authz gating (§5.1)', async () => {
    await sessionLogin(mem); // member is NOT an operator
    const adminRes = await webGet('mcp-admin');
    ok('non-operator GET /mcp-admin → 403', adminRes.status === 403, 'status=' + adminRes.status);
    const expRes = await webGet('mcp-admin/ledger-export.json');
    ok('non-operator GET /mcp-admin/ledger-export.json → 403', expRes.status === 403, 'status=' + expRes.status);
  });

  it('Access lifecycle — no role → grant → mint → remove (§5)', async () => {
    await purgeUserRecords(out.userId); // outsider starts with no MCP role (fixture baseline)
    await sessionLogin(out);
    let toolsRes = await webGet('mcp-tools');
    ok('user without an MCP role → /mcp-tools 403', toolsRes.status === 403, 'status=' + toolsRes.status);

    await operatorLogin(op);
    let adminPage = await (await webGet('mcp-admin')).text();
    await webPost('mcp-admin/access', { authenticity_token: _formTok(adminPage), decision: 'make_user', email: out.email });
    const granted = await rolesFor(out.userId);
    ok('operator grant by email → profile role mcp_user', granted.includes('mcp_user'), JSON.stringify(granted));

    await sessionLogin(out);
    let tools = await (await webGet('mcp-tools')).text();
    ok('granted user now sees the mint form', /mcp-tools\/mint/.test(tools));
    const before = (await tokensFor(out.userId)).length;
    await webPost('mcp-tools/mint', { authenticity_token: _formTok(tools), label: 'ci-web-mint' });
    ok('mint → a new token row for the user', (await tokensFor(out.userId)).length === before + 1);

    await operatorLogin(op);
    adminPage = await (await webGet('mcp-admin')).text();
    await webPost('mcp-admin/access', { authenticity_token: _formTok(adminPage), decision: 'revoke', email: out.email });
    const removed = await rolesFor(out.userId);
    ok('operator remove → no MCP role left', !removed.includes('mcp_user') && !removed.includes('mcp_operator'), JSON.stringify(removed));
    const leftActive = (await tokensFor(out.userId)).filter(t => t.status === 'active');
    ok('operator remove → every token the user held is revoked', leftActive.length === 0, 'active=' + leftActive.length);
    const tokensTab = await webGet('mcp-admin?tab=tokens');
    ok('operator tokens tab renders (exact-key violation counters)', tokensTab.status === 200, 'status=' + tokensTab.status);
    await sessionLogin(out);
    toolsRes = await webGet('mcp-tools');
    ok('removed user → /mcp-tools 403 again', toolsRes.status === 403, 'status=' + toolsRes.status);
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

  it('Token console — a label names one agent, so a label in use is refused', async () => {
    await purgeUserRecords(mem.userId); // start from the seeded tokens only (web mints accumulate across runs)
    await sessionLogin(mem);
    const mint = async (label) => {
      const page = await (await webGet('mcp-tools')).text();
      await webPost('mcp-tools/mint', { authenticity_token: _formTok(page), label });
    };
    const active = async () => (await tokensFor(mem.userId)).filter(t => t.status === 'active');

    await mint('ci-dup-label');
    await mint('CI-DUP-LABEL');
    const shown = await (await webGet('mcp-tools')).text();
    const dups = (await active()).filter(t => t.label.toLowerCase() === 'ci-dup-label');
    ok('same label, any case, on an active token → no second token', dups.length === 1, 'active=' + dups.length);
    ok('the page says the name is in use', /already have an active token named/.test(shown));

    const knownIds = new Set((await active()).map(t => t.id));
    await mint('');
    await mint('');
    const generated = (await active()).filter(t => !knownIds.has(t.id));
    ok('blank label → a generated label, unique each time', generated.length === 2 && generated.every(t => /^mcp-client-[0-9a-f]{6}$/.test(t.label)) && generated[0].label !== generated[1].label, JSON.stringify(generated.map(t => t.label)));

    for (const t of dups) {
      const page = await (await webGet('mcp-tools')).text();
      await webPost('mcp-tools/revoke', { authenticity_token: _formTok(page), id: t.id });
    }
    await mint('ci-dup-label');
    ok('a label is free again once its token is revoked', (await active()).filter(t => t.label === 'ci-dup-label').length === 1);
    await purgeUserRecords(mem.userId);
  });

  it('Token console — plain wording and a link back to the site', async () => {
    await sessionLogin(mem);
    const page = await (await webGet('mcp-tools')).text();
    ok('the page links back to the site', /<a href="\/">← Back to the site<\/a>/.test(page));
    // The page's own wording only: token names in the table are user data.
    const text = page.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<tbody>[\s\S]*?<\/tbody>/, '').replace(/<[^>]+>/g, ' ');
    ok('no jargon (bearer token, MCP client, community, mint)', !/bearer token|MCP client|community|\bmint\b/i.test(text), (text.match(/bearer token|MCP client|community|\bmint\b/i) || [])[0]);
  });

  it('Console forms — a POST without a valid form token is refused and changes nothing (CSRF)', async () => {
    const FORGED = 'forged-form-token';
    const expired = async (res) => res.status === 403 && /This form has expired/.test(await res.text());

    await purgeUserRecords(mem.userId);
    await sessionLogin(mem);
    const before = await tokensFor(mem.userId);
    ok('forged token on /mcp-tools/mint → 403 form expired', await expired(await webPost('mcp-tools/mint', { authenticity_token: FORGED, label: 'ci-csrf-mint' })));
    ok('no token on /mcp-tools/mint → 403 form expired', await expired(await webPost('mcp-tools/mint', { label: 'ci-csrf-mint' })));
    ok('refused mint → no token created', (await tokensFor(mem.userId)).length === before.length);
    await sessionLogin(mem);
    await webPost('mcp-tools/mint', { authenticity_token: _formTok(await (await webGet('mcp-tools')).text()), label: 'ci-csrf-keep' });
    const kept = (await tokensFor(mem.userId)).find(t => t.label === 'ci-csrf-keep' && t.status === 'active');
    ok('a valid mint still works', !!kept);
    ok('forged token on /mcp-tools/revoke → 403 form expired', await expired(await webPost('mcp-tools/revoke', { authenticity_token: FORGED, id: kept?.id })));
    ok('refused revoke → token still active', (await tokensFor(mem.userId)).find(t => t.id === kept?.id)?.status === 'active');

    await clearPendingFor(mem.principal);
    await deleteNotesFor(mem.userId);
    await callTool(mem.rawToken, 'test_approve', { label: 'csrfhold' });
    const handle = (await pendingRecordsFor(mem.principal))[0]?.handle;
    ok('one pending action to protect', !!handle);
    const rolesBefore = await rolesFor(out.userId);
    ok('operator reaches the console (login ok)', await operatorLogin(op));
    const adminPosts = [
      ['mcp-admin/approve', { handle }],
      ['mcp-admin/reject', { handle }],
      ['mcp-admin/reject-principal', { principal_id: mem.principal }],
      ['mcp-admin/access', { decision: 'make_admin', email: out.email }],
      ['mcp-admin/token-revoke', { id: kept?.id }],
      ['mcp-admin/eval', {}],
    ];
    for (const [path, fields] of adminPosts) {
      ok(`forged token on /${path} → 403 form expired`, await expired(await webPost(path, { authenticity_token: FORGED, ...fields })));
    }
    ok('refused approve/reject → the action is still pending', (await pendingFor(mem.principal)).length === 1);
    ok('refused approve → the action never ran', (await notesFor(mem.userId)).filter(x => x.source === 'test_approve').length === 0);
    ok('refused access change → roles unchanged', JSON.stringify(await rolesFor(out.userId)) === JSON.stringify(rolesBefore), JSON.stringify(await rolesFor(out.userId)));
    ok('refused operator revoke → token still active', (await tokensFor(mem.userId)).find(t => t.id === kept?.id)?.status === 'active');

    const consent = await webPost('oauth/authorize', { authenticity_token: FORGED, rid: 'forged', decision: 'approve' });
    ok('forged consent decision → 400, no redirect to the client', consent.status === 400 && !consent.headers.get('location'), 'status=' + consent.status);

    await clearPendingFor(mem.principal);
    await purgeUserRecords(mem.userId);
  });

  it('Eval — model-read text in schemas, instructions and prompts is linted (§12.3)', async () => {
    const runEval = async () => {
      ok('operator reaches the console (login ok)', await operatorLogin(op));
      await webPost('mcp-admin/eval', { authenticity_token: _formTok(await (await webGet('mcp-admin')).text()) });
      const r = await adm.gql(`{ records(per_page: 1, filter: { table: { value: "modules/mcp/mcp_eval_run" } }, sort: [{ id: { order: DESC } }]) { results { failures_json: property(name: "failures_json") } } }`);
      return JSON.parse(r?.data?.records?.results?.[0]?.failures_json || '[]');
    };

    ok('a tool with flagged schema text is still served (the lint is not fatal)', (await listNames(mem.rawToken)).includes('test_poisoned_text'));
    let fails = await runEval();
    const tool = fails.find(f => f.check === 'no_poison' && f.target === 'test_poisoned_text');
    ok('eval flags a nested parameter description', /input_schema\.properties\.filters\.properties\.term\.description: [^;]*ignore previous/.test(tool?.detail || ''), tool?.detail);
    ok('eval flags an output_schema description', /output_schema\.properties\.marker\.description: [^;]*you must/.test(tool?.detail || ''), tool?.detail);
    ok('eval flags no clean tool', !fails.some(f => f.check === 'no_poison' && f.target !== 'test_poisoned_text'), JSON.stringify(fails.filter(f => f.check === 'no_poison').map(f => f.target)));
    const prompt = fails.find(f => f.check === 'prompt_no_poison' && f.target === 'test_poisoned_prompt');
    ok('eval flags a prompt argument description', /arguments\.topic\.description: [^;]*disregard/.test(prompt?.detail || ''), prompt?.detail);
    ok('eval flags no clean prompt', !fails.some(f => f.check === 'prompt_no_poison' && f.target !== 'test_poisoned_prompt'));
    ok('clean instructions are not flagged', !fails.some(f => f.check === 'instructions_no_poison'));

    await setConstant('MCP_CONFIG', JSON.stringify({ instructions_partial: 'mcp/tests/poisoned_instructions' }));
    fails = await runEval();
    const instructions = fails.find(f => f.check === 'instructions_no_poison');
    ok('eval flags poisoned connection instructions', /ignore previous/.test(instructions?.detail || ''), instructions?.detail);
    await unsetConstant('MCP_CONFIG');
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
