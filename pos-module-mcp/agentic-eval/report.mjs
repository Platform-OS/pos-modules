/**
 * pos-module-mcp — agentic-eval report generator.
 *
 * Merges the two per-run artifacts into ONE readable markdown report:
 *   • the grader VERDICT (results/run-*.jsonl row)  — trusted ground truth (ledger + live probes)
 *   • the agent's NARRATIVE (results/<runId>.transcript.jsonl) — the agent's own claims
 *
 * Used two ways:
 *   • imported by run.mjs, which calls writeReport(...) after each graded run; and
 *   • standalone: `node report.mjs [runId]` regenerates from existing results/ files
 *     (no arg ⇒ the most recent run).
 *
 * The report deliberately separates "what the grader verified" from "what the agent
 * claimed" — an agent HELD/FAILED headline is an argument, not a verdict.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const RESULTS = join(HERE, 'results');

const mark = (p) => (p ? '✅' : '❌');

/** Build the markdown for one graded run and write results/<runId>.report.md. */
export function writeReport({ row, transcript }) {
  const runId = row.runId;
  const out = join(RESULTS, `${runId}.report.md`);
  const checks = row.checks || [];
  const negControl = row.mode === 'negative-control';
  const inconclusive = row.verdict === 'INCONCLUSIVE';
  // In negative-control mode the meaningful verdict is inverted: catching the planted
  // vulns (raw verdict FAILED) is a PASS for the assessment.
  let verdict, badge;
  if (row.error) { verdict = 'ERROR'; badge = '🔴'; }
  else if (negControl) {
    const pass = !inconclusive && (row.planted_detected || 0) >= 1;
    verdict = inconclusive ? 'INCONCLUSIVE'
      : pass ? `NEG-CONTROL PASS (detected ${row.planted_detected}/4 planted vulns)`
             : 'NEG-CONTROL FAIL (missed planted vulns)';
    badge = inconclusive ? '⚪' : pass ? '🟢' : '🔴';
  } else {
    verdict = row.verdict || 'UNKNOWN';
    badge = verdict === 'HELD' || verdict === 'PASS' ? '🟢' : inconclusive ? '⚪' : '🔴';
  }

  const lines = [];
  lines.push(`# Agentic-eval report — ${row.task}${negControl ? ' (negative control)' : ''}`);
  lines.push('');
  lines.push(`**Verdict:** ${badge} \`${verdict}\`  ·  **Score:** ${row.score ?? '—'}  ·  **Track:** ${row.track || '—'}`);
  lines.push('');
  lines.push('| | |');
  lines.push('|---|---|');
  lines.push(`| Run id | \`${runId}\` |`);
  lines.push(`| Agent / model | \`${row.agent || '—'}\` |`);
  lines.push(`| Principal | \`${row.principal || '—'}\` |`);
  lines.push(`| Duration | ${row.ms != null ? (row.ms / 1000).toFixed(1) + 's' : '—'}${row.timed_out ? ' (TIMEOUT)' : ''} |`);
  lines.push(`| opencode exit | ${row.agent_exit ?? '—'} |`);
  lines.push('');

  lines.push('## Grader verdict (ground truth — ledger + live probes)');
  lines.push('');
  if (row.error) {
    lines.push(`> ERROR: ${row.error}`);
  } else if (!checks.length) {
    lines.push('_No checks recorded._');
  } else {
    lines.push('| ✓ | Check | Detail |');
    lines.push('|---|---|---|');
    for (const c of checks) lines.push(`| ${mark(c.pass)} | ${c.name} | ${c.detail || ''} |`);
  }
  lines.push('');
  lines.push('> The verdict above is derived by code from the attested ledger and active endpoint');
  lines.push('> probes — not from the agent\'s self-report. A run with zero attested tool calls is');
  lines.push('> `INCONCLUSIVE`, never a false `HELD`.');
  lines.push('');

  lines.push('## Agent narrative (the attacker\'s own report — claims, not verdict)');
  lines.push('');
  if (transcript && transcript.trim()) {
    lines.push('```');
    lines.push(transcript.trim());
    lines.push('```');
  } else {
    lines.push('_No transcript captured (agent produced no output)._');
  }
  lines.push('');

  writeFileSync(out, lines.join('\n'));
  return out;
}

// ---- standalone: regenerate from existing results/ files ----
function latestRunId() {
  const runs = readdirSync(RESULTS).filter((f) => /^run-.*\.jsonl$/.test(f))
    .map((f) => ({ f, t: readFileSync(join(RESULTS, f), 'utf8') }));
  if (!runs.length) return null;
  // newest file by name (timestamped) — take its last row
  runs.sort((a, b) => (a.f < b.f ? 1 : -1));
  const rows = runs[0].t.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return rows[rows.length - 1]?.runId || null;
}

function loadRow(runId) {
  for (const f of readdirSync(RESULTS).filter((f) => /^run-.*\.jsonl$/.test(f))) {
    for (const line of readFileSync(join(RESULTS, f), 'utf8').trim().split('\n').filter(Boolean)) {
      const r = JSON.parse(line);
      if (r.runId === runId) return r;
    }
  }
  return null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const runId = process.argv[2] || latestRunId();
  if (!runId) { console.error('no runs found in results/'); process.exit(1); }
  const row = loadRow(runId);
  if (!row) { console.error(`no JSONL row for runId ${runId}`); process.exit(1); }
  let transcript = '';
  try { transcript = readFileSync(join(RESULTS, `${runId}.transcript.jsonl`), 'utf8'); } catch {}
  const out = writeReport({ row, transcript });
  console.log(`report → ${out}`);
}
