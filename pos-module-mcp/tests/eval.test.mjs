/**
 * pos-module-mcp — tool-surface eval (spec §19.3), Vitest.
 *
 * Drives the in-platform deterministic eval through the operator console, reads the
 * mcp_eval_run record that POST created, and FAILS on any tool-surface regression. Web
 * client + admin client come from ./lib/harness.mjs.
 *
 * The module MUST NOT call LLMs (spec §2), so the "do the tool DESCRIPTIONS lead a model
 * to the expected tool" check is left as the keyed LLM_SELECTION_HOOK extension below —
 * this runner stays network/LLM-free and CI-cheap.
 *
 * Run:  npx vitest run tests/eval.test.mjs
 * Env:  MCP_URL, MCP_TOKEN (admin) — falls back to the repo .pos "ps".
 *       MCP_OP_EMAIL, MCP_OP_PASS — operator login. Without them the suite re-imports the
 *       deterministic fixtures (tests/seed/seed.mjs) and signs in as the fixture operator.
 */
import { describe, it, beforeAll, expect } from 'vitest';
import { loadEnv, makeAdmin, makeWeb } from './lib/harness.mjs';
import { FIXT, applyReset } from './seed/seed.mjs';

const { base, admin } = loadEnv();
const opEmail = process.env.MCP_OP_EMAIL || FIXT.users.operator.email;
const opPass = process.env.MCP_OP_PASS || FIXT.users.operator.password;

const adm = makeAdmin({ base, admin });
const web = makeWeb(base);

const LATEST_RUN = `{ records(per_page:1, filter:{table:{value:"modules/mcp/mcp_eval_run"}}, sort:[{id:{order:DESC}}]) { results { id total: property(name:"total") passed: property(name:"passed") failed: property(name:"failed") failures_json: property(name:"failures_json") } } }`;
const latestRun = async () => (await adm.gql(LATEST_RUN))?.data?.records?.results?.[0];

let loggedIn = false;

describe('eval · tool-surface regression', () => {
  beforeAll(async () => {
    if (!process.env.MCP_OP_EMAIL) await applyReset(adm.gql);
    loggedIn = await web.operatorLogin({ email: opEmail, password: opPass });
  });

  it('operator can reach the console', () => {
    expect(loggedIn, `operator login failed for ${opEmail} — check MCP_OP_EMAIL/MCP_OP_PASS (and that the user is an MCP operator)`).toBe(true);
  });

  it('the deterministic tool-surface eval passes (0 failures)', async () => {
    expect(loggedIn, 'skipped: operator not logged in').toBe(true);

    // Trigger the eval via the operator console (POST needs the session's CSRF token).
    const before = Number((await latestRun())?.id || 0);
    const adminPage = await (await web.get('mcp-admin')).text();
    const res = await web.post('mcp-admin/eval', { authenticity_token: web.formTok(adminPage) });
    expect(res.status, 'the eval POST was accepted').toBe(302);

    // ── LLM_SELECTION_HOOK: run model-based selection eval over golden cases here ──

    // Read the run this POST recorded (never an older one).
    const run = await latestRun();
    expect(Number(run?.id || 0), 'no new eval run was recorded').toBeGreaterThan(before);

    const failed = parseInt(run.failed, 10);
    const detail = failed > 0
      ? JSON.parse(run.failures_json || '[]').map(f => `[${f.category}] ${f.check} · ${f.target} — ${f.detail}`).join('\n')
      : '';
    expect(failed, `${run.passed}/${run.total} passed; failures:\n${detail}`).toBe(0);
  });
});
