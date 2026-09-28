#!/usr/bin/env node
/**
 * pos-module-mcp — agentic-eval runner (walking skeleton).
 *
 * ONE real end-to-end slice of the methodology in README.md:
 *
 *   seed   → provision a SCOPED, low-privilege eval principal (real pOS user + bearer
 *            token) via the admin plane; snapshot a ledger cursor.
 *   drive  → run a real LLM agent (opencode, headless) against the GOVERNED MCP surface
 *            only — the agent gets the scoped token, never the admin token.
 *   grade  → code-graders (tasks.mjs) over the tamper-evident ledger + instance state.
 *            Outcome-not-claim: the transcript is evidence, the ledger is truth.
 *   teardown→ delete the principal + its rows (guaranteed, even on error).
 *   record → append one JSONL row per (task × repeat) to results/.
 *
 * Reuses the PROVEN seeding primitives from ../tests/fixtures.mjs — no re-implementation.
 *
 * Usage:
 *   node run.mjs [--track safety|utility|all] [--task <id>|all] [--k N]
 *                [--model provider/model] [--dry] [--keep] [--timeout SECONDS]
 *
 *   --dry      seed + print the brief and scoped creds, skip the agent + grading (no spend)
 *   --keep     skip teardown (leaves the principal for inspection)
 *   --model    override opencode.json's model (else the config's model is used)
 *   --timeout  per-agent-run wall-clock cap (default 300s)
 *
 * Env (or agentic-eval/.env, auto-loaded): MCP_URL + MCP_TOKEN (admin plane). The agent
 * plane (MCP_EVAL_URL / MCP_EVAL_TOKEN) is injected into the opencode child per task.
 */
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, appendFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { loadEnv, makeAdmin, makeUser, teardownMatrix, defaultRunId } from '../tests/fixtures.mjs';
import { selectTasks } from './tasks.mjs';
import { writeReport } from './report.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const T_LEDGER = 'modules/mcp/mcp_ledger';
const T_NOTE = 'test_note';

// ---- minimal .env loader (zero-dep; never overrides an already-set env var) ----
function loadDotEnv() {
  const p = join(HERE, '.env');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m || line.trimStart().startsWith('#')) continue;
    const [, k, v] = m;
    if (process.env[k] === undefined) process.env[k] = v.replace(/^["']|["']$/g, '');
  }
}

// ---- args ----
function parseArgs(argv) {
  const a = { track: 'safety', task: 'all', k: 1, dry: false, keep: false, model: null, timeout: 300, verbose: false, vuln: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--track') a.track = argv[++i];
    else if (t === '--task') a.task = argv[++i];
    else if (t === '--k') a.k = Math.max(1, parseInt(argv[++i], 10) || 1);
    else if (t === '--model') a.model = argv[++i];
    else if (t === '--timeout') a.timeout = Math.max(30, parseInt(argv[++i], 10) || 300);
    else if (t === '--dry') a.dry = true;
    else if (t === '--keep') a.keep = true;
    else if (t === '--verbose' || t === '-v') a.verbose = true;
    else if (t === '--vuln') a.vuln = true;
    else { console.error(`unknown arg: ${t}`); process.exit(2); }
  }
  return a;
}

// ---- admin-plane ground-truth readers (the graders' only source of truth) ----
function makeDb(adm) {
  return {
    async maxLedgerId() {
      const r = await adm.gql(`{ records(per_page: 1, filter: { table: { value: "${T_LEDGER}" } }, sort: [{ id: { order: DESC } }]) { results { id } } }`);
      return Number(r?.data?.records?.results?.[0]?.id || 0);
    },
    async ledgerSince(principal, cursor) {
      const r = await adm.gql(`{ records(per_page: 500, filter: { table: { value: "${T_LEDGER}" } properties: [{ name: "principal_id", value: "${principal}" }] }, sort: [{ id: { order: ASC } }]) { results { id tool: property(name: "tool_name") outcome: property(name: "execution_outcome") authz: property(name: "authz_decision") subject: property(name: "subject_id") } } }`);
      return (r?.data?.records?.results || []).filter((e) => Number(e.id) > Number(cursor));
    },
    async notesFor(userId) {
      const r = await adm.gql(`{ records(per_page: 100, filter: { table: { value: "${T_NOTE}" } properties: [{ name: "user_id", value: "${userId}" }] }) { results { id label: property(name: "label") userId: property(name: "user_id") } } }`);
      return r?.data?.records?.results || [];
    },
    // Mint a fresh active bearer token for a user — used by graders that must probe the
    // surface themselves with a clean token (not the agent's possibly rate-limited/suspended one).
    // Optional `allowedTools` narrows the token (per-token least-privilege); it's an array
    // property, so we mint via import_models (the proven array-property path) in that case.
    async mintToken(userId, allowedTools) {
      const raw = 'mcp_ci_' + randomBytes(16).toString('hex');
      const digest = createHash('sha256').update(raw).digest('hex');
      if (allowedTools && allowedTools.length) {
        const models = [{ type_name: 'modules/mcp/mcp_token', user_id: String(userId), properties: {
          user_id: String(userId), token_digest: digest, label: 'grader-narrow', status: 'active', allowed_tools: allowedTools } }];
        const r = await adm.gql('mutation($models:[CustomizationImport!]!){ import_models(_id_remap:true,_index_rebuild:false, models:$models){ ids } }', { models });
        return { raw, id: r?.data?.import_models?.ids?.[0] };
      }
      const r = await adm.gql(`mutation { record_create(record: { table: "modules/mcp/mcp_token" properties: [ { name: "user_id", value: "${userId}" } { name: "token_digest", value: "${digest}" } { name: "label", value: "grader-probe" } { name: "status", value: "active" } ] }) { id } }`);
      return { raw, id: r?.data?.record_create?.id };
    },
    // ALL ledger entries created since `cursor`, in canonical chain order (id ASC),
    // with the hash-chain fields. Global (every principal) — the chain spans them.
    // platformOS records() has no numeric id filter, so page DESC and stop once we
    // cross the cursor (only touches the run's recent entries, not the whole ledger).
    async chainSince(cursor) {
      const out = []; const cur = Number(cursor);
      for (let page = 1; page <= 50; page++) {
        const r = await adm.gql(`{ records(per_page: 200, page: ${page}, filter: { table: { value: "${T_LEDGER}" } }, sort: [{ id: { order: DESC } }]) { results { id seq: property(name: "seq") h: property(name: "entry_hash") prev: property(name: "prev_entry_hash") } } }`);
        const rows = r?.data?.records?.results || [];
        if (!rows.length) break;
        let crossed = false;
        for (const e of rows) { if (Number(e.id) > cur) out.push(e); else crossed = true; }
        if (crossed || rows.length < 200) break;
      }
      return out.sort((a, b) => Number(a.id) - Number(b.id));
    },
  };
}

/** Verify the hash chain is intact across `entries` (id-ASC): each entry's
 *  prev_entry_hash must equal the preceding entry's entry_hash, and seq must
 *  increment by exactly 1. Detects the concurrent-append fork (two entries sharing
 *  a prev_entry_hash → duplicate seq → linkage break). Returns { ok, detail }. */
export function verifyChain(entries) {
  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i - 1], cur = entries[i];
    if (cur.prev !== prev.h) {
      return { ok: false, detail: `linkage break at id ${cur.id} (seq ${cur.seq}): prev_entry_hash ≠ preceding entry_hash` };
    }
    if (Number(cur.seq) !== Number(prev.seq) + 1) {
      return { ok: false, detail: `seq fork at id ${cur.id}: seq ${cur.seq} follows seq ${prev.seq}` };
    }
  }
  return { ok: true, detail: `${entries.length} entries, chain linked` };
}

// Concise live trace of one opencode JSON event (tool calls + text), for --verbose.
function traceEvent(line) {
  let e; try { e = JSON.parse(line); } catch { return; }
  const t = e.type || e.part?.type;
  if (t === 'tool' || t === 'tool-invocation' || t === 'tool_use') {
    const p = e.part || e;
    const name = p.tool || p.name || p.toolName || '?';
    const st = p.state?.status || p.status || '';
    const inp = p.state?.input || p.input;
    console.error(`    ▸ tool ${name} ${st}${inp ? ' ' + JSON.stringify(inp).slice(0, 160) : ''}`);
  } else if (t === 'text' && (e.part?.text || e.text)) {
    const txt = (e.part?.text || e.text).trim();
    if (txt) console.error(`    · ${txt.slice(0, 200).replace(/\n/g, ' ')}`);
  } else if (t === 'step-finish' || t === 'step_finish') {
    const tok = e.part?.tokens;
    if (tok) console.error(`    — step done (in ${tok.input} / out ${tok.output})`);
  }
}

// ---- drive one agent run; resolves { code, stdout, stderr, timedOut } ----
function driveAgent({ brief, agent, model, evalUrl, evalToken, timeoutS, verbose }) {
  // Default (streaming) format, not --format json: json buffers all output and a
  // SIGKILL at timeout discards it, leaving a 0-byte transcript even when the agent
  // acted. Streaming writes incrementally, so we keep partial evidence on timeout.
  const args = ['run', '--dangerously-skip-permissions'];
  if (agent) args.push('--agent', agent);
  if (model) args.push('-m', model);
  args.push(brief);
  // --dangerously-skip-permissions: headless bash (the pentester's curl) cannot prompt.
  // Safe here — the persona is write:false / task:deny, opencode.json denies edit+webfetch,
  // and the target is an isolated test instance.
  const env = { ...process.env, MCP_EVAL_URL: evalUrl, MCP_EVAL_TOKEN: evalToken };
  return new Promise((res) => {
    // stdin: 'ignore' — opencode `run` blocks reading stdin for piped input; if spawn
    // leaves stdin an open pipe it waits for EOF forever and never runs the message.
    const child = spawn('opencode', args, { cwd: HERE, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', timedOut = false, buf = '';
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutS * 1000);
    child.stdout.on('data', (d) => {
      stdout += d;
      if (verbose) { buf += d; const lines = buf.split('\n'); buf = lines.pop(); for (const l of lines) if (l.trim()) traceEvent(l); }
    });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (e) => { clearTimeout(timer); res({ code: -1, stdout, stderr: stderr + '\n' + e.message, timedOut }); });
    child.on('close', (code) => { clearTimeout(timer); res({ code, stdout, stderr, timedOut }); });
  });
}

async function main() {
  loadDotEnv();
  const args = parseArgs(process.argv.slice(2));
  const tasks = selectTasks({ track: args.track, id: args.task });
  if (!tasks.length) { console.error(`no tasks match --track ${args.track} --task ${args.task}`); process.exit(2); }

  const { base, admin } = loadEnv();               // admin plane (runner only)
  const adm = makeAdmin({ base, admin });
  const db = makeDb(adm);
  const evalUrl = base.endsWith('/') ? base + 'mcp' : base + '/mcp';

  // preflight: opencode present + admin GraphQL reachable — fail fast, clear message.
  if (!args.dry) {
    const probe = await new Promise((r) => spawn('opencode', ['--version']).on('error', () => r(false)).on('close', (c) => r(c === 0)));
    if (!probe) { console.error('opencode not on PATH — install it or run with --dry'); process.exit(2); }
  }
  const ping = await adm.gql('{ __typename }');
  if (!ping?.data) { console.error('admin GraphQL unreachable — check MCP_URL/MCP_TOKEN'); process.exit(2); }

  const resultsDir = join(HERE, 'results');
  mkdirSync(resultsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = join(resultsDir, `run-${stamp}.jsonl`);

  console.log(`agentic-eval: ${tasks.length} task(s) × k=${args.k} → ${outFile}`);
  console.log(`target ${evalUrl} | model ${args.model || '(opencode.json default)'}${args.dry ? ' | DRY' : ''}\n`);

  // Graceful teardown on interruption: SIGINT/SIGTERM skip try/finally, which would
  // otherwise LEAK the in-flight principal. Tear down the active handle, then exit.
  const setVuln = async (on) => {
    try { await adm.gql(`mutation { constant_${on ? 'set(name: "MCP_ENABLE_VULN_TOOLS", value: "1")' : 'unset(name: "MCP_ENABLE_VULN_TOOLS")'} { name } }`); } catch (e) { console.error(`  vuln-flag ${on ? 'set' : 'unset'} warn: ${e.message}`); }
  };
  let activeHandle = null;
  const onSignal = async (sig) => {
    console.error(`\n${sig} — cleaning up…`);
    const h = activeHandle; activeHandle = null;
    if (h && !args.keep) { try { await teardownMatrix(adm, { agent: h }); } catch {} }
    try { await setVuln(false); } catch {} // unset regardless (covers --vuln and per-task needsVulnTools)
    process.exit(130);
  };
  process.on('SIGINT', () => onSignal('SIGINT'));
  process.on('SIGTERM', () => onSignal('SIGTERM'));

  // Negative-control mode: enable the planted vuln_* tools for the duration of the run,
  // guaranteed-restored in the finally below (and on signal).
  if (args.vuln) { await setVuln(true); console.log('NEGATIVE CONTROL — MCP_ENABLE_VULN_TOOLS=1: planted vuln_* tools are live; a run that DETECTS them (FAILED for the right reason) PASSES.\n'); }

  let held = 0, failed = 0, errored = 0;
  try {
  for (const task of tasks) {
    for (let rep = 1; rep <= args.k; rep++) {
      const runId = `${defaultRunId()}-${task.id}-${rep}`;
      const started = Date.now();
      let handle = null, row, setup = null, taskVuln = false;
      try {
        // seed a scoped principal (real user + bearer token)
        handle = await makeUser(adm, { runId, key: 'agent', role: task.seed.role, status: task.seed.status, withToken: true, label: `eval-${task.id}` });
        activeHandle = handle;
        const cursor = await db.maxLedgerId();
        const brief = task.brief({ principal: handle.principal, runId });

        if (args.dry) {
          console.log(`[dry] ${task.id}#${rep}  principal=${handle.principal} token=${handle.rawToken.slice(0, 12)}…`);
          console.log(brief.split('\n').map((l) => '      ' + l).join('\n') + '\n');
          row = { task: task.id, rep, runId, dry: true, principal: handle.principal };
        } else {
          // Per-task hooks: some scenarios need the gated honeypot/vuln tools live for the
          // run (independent of --vuln's inverted verdict) and/or pre-seeded world state
          // (e.g. a poisoned record). Enabled here, guaranteed-restored in the finally.
          taskVuln = !!task.needsVulnTools && !args.vuln;
          if (taskVuln) await setVuln(true);
          if (task.setup) setup = await task.setup({ adm, db, handle, runId });
          if (args.verbose) console.log(`▶ ${task.id}#${rep}  principal=${handle.principal}  driving ${task.agent || 'default'}…`);
          const drv = await driveAgent({
            brief, agent: task.agent, model: args.model,
            evalUrl, evalToken: handle.rawToken, timeoutS: args.timeout, verbose: args.verbose,
          });
          // persist the raw agent transcript as evidence (schema-inspectable JSONL)
          const tPath = join(resultsDir, `${runId}.transcript.jsonl`);
          try { appendFileSync(tPath, drv.stdout); } catch {}
          const graded = await task.grade({ adm, db, handle, cursor, transcript: drv.stdout, runId, mcpUrl: evalUrl, verifyChain, setup });
          const inconclusive = graded.verdict === 'INCONCLUSIVE';
          const plantedDetected = (graded.checks || []).filter((c) => c.planted && !c.pass).length;
          // --vuln (negative control) INVERTS the meaning: the run PASSES when the eval
          // catches ≥1 planted vuln (verdict FAILED for the right reason); a HELD there
          // means the assessment MISSED the planted vulns — the negative control failed.
          let bad, mark, status;
          if (args.vuln) {
            const negOk = !inconclusive && plantedDetected >= 1;
            bad = !inconclusive && !negOk;
            inconclusive ? errored++ : (negOk ? held++ : failed++);
            mark = inconclusive ? '∅' : (negOk ? '✓' : '✗');
            status = inconclusive ? 'INCONCLUSIVE'
              : (negOk ? `NEG-CONTROL PASS — detected ${plantedDetected}/4 planted vulns`
                       : 'NEG-CONTROL FAIL — assessment MISSED the planted vulns');
          } else {
            bad = graded.verdict === 'FAILED' || graded.verdict === 'FAIL';
            bad ? failed++ : (inconclusive ? errored++ : held++);
            mark = bad ? '✗' : (inconclusive ? '∅' : '✓');
            status = graded.verdict;
          }
          row = {
            task: task.id, rep, runId, track: task.track, agent: task.agent || 'default',
            mode: args.vuln ? 'negative-control' : 'positive', verdict: graded.verdict,
            planted_detected: plantedDetected, score: Number(graded.score.toFixed(3)),
            checks: graded.checks, principal: handle.principal,
            agent_exit: drv.code, timed_out: drv.timedOut,
            ms: Date.now() - started,
            transcript_bytes: drv.stdout.length,
          };
          console.log(`${mark} ${task.id}#${rep}  ${status}  score=${row.score}  (${row.ms}ms${drv.timedOut ? ', TIMEOUT' : ''})`);
          for (const c of graded.checks) console.log(`    ${c.pass ? '✓' : '✗'} ${c.name}${c.detail ? ' — ' + c.detail : ''}`);
          try { const rp = writeReport({ row, transcript: drv.stdout }); console.log(`    report → ${rp.split('/').pop()}`); } catch (e) { console.error(`    report warn: ${e.message}`); }
        }
      } catch (e) {
        errored++;
        row = { task: task.id, rep, runId, error: e.message, ms: Date.now() - started };
        console.log(`! ${task.id}#${rep}  ERROR — ${e.message}`);
      } finally {
        if (setup && setup.cleanup) { try { await setup.cleanup(); } catch (e) { console.error(`  setup cleanup warn: ${e.message}`); } }
        if (taskVuln) { try { await setVuln(false); } catch {} }
        if (handle && !args.keep) { try { await teardownMatrix(adm, { agent: handle }); } catch (e) { console.error(`  teardown warn: ${e.message}`); } }
        activeHandle = null;
      }
      appendFileSync(outFile, JSON.stringify(row) + '\n');
    }
  }
  } finally {
    if (args.vuln) { await setVuln(false); console.log('\nrestored: MCP_ENABLE_VULN_TOOLS unset (instance back to positive-control).'); }
  }

  if (!args.dry) {
    const label = args.vuln ? `${held} neg-control pass · ${failed} missed · ${errored} errored` : `${held} held/pass · ${failed} failed · ${errored} errored`;
    console.log(`\nsummary: ${label} → ${outFile}`);
    process.exit(failed > 0 || errored > 0 ? 1 : 0);
  }
}

// Only run when invoked directly (`node run.mjs`), not when imported for its exports
// (e.g. `verifyChain`) — importing must have no side effects.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
