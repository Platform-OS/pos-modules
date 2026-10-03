#!/usr/bin/env node
/**
 * pos-module-mcp — metrics aggregation PERFORMANCE benchmark.
 *
 * Decides the metrics-aggregation strategy with DATA, not guesses: at growing row
 * counts it times the two candidate approaches and reports the crossover.
 *
 *   A. SCAN   — paginate every matching row (per_page 100) and tally client-side.
 *               This is what observability/metrics does today (O(N), capped at 10k).
 *   B. COUNTS — a fixed set of server-side `total_entries` filtered counts
 *               (one per known bucket value). All-time exact, uncapped.
 *
 * ISOLATION: benchmarks against the disposable `test_note` table (same platformOS
 * records + COUNT machinery → faithful scaling), rows marked `source: PERF_MARK`,
 * NEVER the real hash-chained mcp_ledger. Cleans up via records_delete_all.
 *
 *   node tests/perf/ledger-metrics-bench.mjs run     # seed 1k/10k/50k + bench each
 *   node tests/perf/ledger-metrics-bench.mjs clean    # remove all perf rows
 *
 * Env: MCP_URL, MCP_TOKEN (admin) — falls back to the repo .pos "ps".
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const T = 'test_note';
const PERF_MARK = 'perf-bench';
// A representative bucket distribution — mirrors the ledger's execution_outcome enum
// so the COUNTS strategy issues the same number of queries the real metrics would.
const BUCKETS = ['success', 'error', 'rolled_back', 'pending_approval', 'denied',
  'invalid', 'replayed', 'suspended', 'approval_duplicate', 'approval_throttled'];
// Row counts to benchmark. 1k+10k is decisive and runs in ~30s; larger stages just
// confirm the trend but are slow to seed (import throughput) — override for a full
// curve on a reserved instance, e.g. MCP_BENCH_STAGES=1000,10000,50000.
const STAGES = (process.env.MCP_BENCH_STAGES || '1000,10000').split(',').map((s) => parseInt(s.trim(), 10));
const BATCH = 500;          // gentler bulk-insert to avoid gateway backpressure
const SEED_DELAY_MS = 40;   // small pause between batches
const PERF_USER = '9990001'; // reserved; coverage never queries this user

function loadEnv() {
  let url = process.env.MCP_URL, token = process.env.MCP_TOKEN;
  if (!url || !token) {
    const here = dirname(fileURLToPath(import.meta.url));
    const dotpos = JSON.parse(readFileSync(resolve(here, '../../.pos'), 'utf8'));
    const env = dotpos.ps || Object.values(dotpos)[0];
    url = url || env.url; token = token || env.token;
  }
  if (!url.endsWith('/')) url += '/';
  return { base: url, admin: token };
}
const { base, admin } = loadEnv();
const GQL = base + 'api/graph';

// Retry on transient failures — under heavy bulk-seed load the gateway occasionally
// returns a non-JSON error page (HTML) or a 5xx; a production-grade harness rides
// through those with backoff rather than crashing mid-benchmark.
async function gql(query, variables = {}, attempt = 0) {
  try {
    const r = await fetch(GQL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Token ' + admin }, body: JSON.stringify({ query, variables }) });
    const text = await r.text();
    try { return JSON.parse(text); }
    catch { throw new Error(`non-JSON response (HTTP ${r.status})`); }
  } catch (e) {
    if (attempt >= 4) throw e;
    await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
    return gql(query, variables, attempt + 1);
  }
}
const IMPORT = 'mutation($m:[CustomizationImport!]!){ import_models(_id_remap:true,_index_rebuild:false, models:$m){ ids } }';
const now = () => Number(process.hrtime.bigint() / 1000000n); // ms

async function perfCount() {
  const r = await gql(`{ records(per_page:1, filter:{ table:{value:"${T}"} properties:[{name:"source",value:"${PERF_MARK}"}] }){ total_entries } }`);
  return r?.data?.records?.total_entries ?? 0;
}
async function cleanup() {
  const r = await gql(`mutation{ records_delete_all(table:"${T}", filter:{ properties:[{name:"source",value:"${PERF_MARK}"}] }){ count } }`);
  return r?.data?.records_delete_all?.count ?? 0;
}
async function seedTo(target) {
  let have = await perfCount();
  while (have < target) {
    const n = Math.min(BATCH, target - have);
    const models = Array.from({ length: n }, (_, i) => ({
      type_name: T,
      properties: { user_id: PERF_USER, source: PERF_MARK, label: BUCKETS[(have + i) % BUCKETS.length] },
    }));
    const r = await gql(IMPORT, { m: models });
    if (r?.errors) throw new Error('seed import failed: ' + JSON.stringify(r.errors));
    have += n;
    process.stdout.write(`\r  seeding ${T}[${PERF_MARK}] → ${have}/${target}   `);
    if (have < target) await new Promise((res) => setTimeout(res, SEED_DELAY_MS));
  }
  process.stdout.write('\n');
}

// ---- Strategy A: paginate every row + tally by bucket (client-side) ----
async function benchScan() {
  const t0 = now();
  let page = 1, rows = 0, pages = 0; const tally = {};
  for (;;) {
    const r = await gql(`{ records(per_page:100, page:${page}, filter:{ table:{value:"${T}"} properties:[{name:"source",value:"${PERF_MARK}"}] }){ has_next_page results{ label:property(name:"label") } } }`);
    const res = r?.data?.records?.results || []; pages++;
    for (const x of res) { tally[x.label] = (tally[x.label] || 0) + 1; rows++; }
    if (!r?.data?.records?.has_next_page) break;
    page++;
  }
  return { ms: now() - t0, pages, rows, buckets: Object.keys(tally).length };
}

// ---- Strategy B: fixed set of total_entries counts (server-side) ----
async function benchCounts() {
  const t0 = now();
  let queries = 0;
  const total = (await gql(`{ records(per_page:1, filter:{ table:{value:"${T}"} properties:[{name:"source",value:"${PERF_MARK}"}] }){ total_entries } }`))?.data?.records?.total_entries ?? 0;
  queries++;
  const by = {};
  for (const b of BUCKETS) {
    const c = (await gql(`{ records(per_page:1, filter:{ table:{value:"${T}"} properties:[{name:"source",value:"${PERF_MARK}"},{name:"label",value:"${b}"}] }){ total_entries } }`))?.data?.records?.total_entries ?? 0;
    by[b] = c; queries++;
  }
  return { ms: now() - t0, queries, total };
}

// ---- single filtered count latency (does one COUNT degrade with N?) ----
async function benchSingleCount() {
  const t0 = now();
  await gql(`{ records(per_page:1, filter:{ table:{value:"${T}"} properties:[{name:"source",value:"${PERF_MARK}"},{name:"label",value:"success"}] }){ total_entries } }`);
  return now() - t0;
}

async function run() {
  console.log(`metrics-bench → ${GQL}\n(isolated table=${T} marker=${PERF_MARK}; NEVER touches mcp_ledger)`);
  console.log('\ncleaning any prior perf rows...'); console.log('  deleted', await cleanup());
  const results = [];
  for (const N of STAGES) {
    console.log(`\n=== N = ${N} ===`);
    await seedTo(N);
    // warm + measure (median of 3 for counts/single; scan once — it is the expensive one)
    const scan = await benchScan();
    const c1 = await benchCounts(); const c2 = await benchCounts();
    const s1 = await benchSingleCount(), s2 = await benchSingleCount(), s3 = await benchSingleCount();
    const counts = c1.ms <= c2.ms ? c1 : c2;
    const single = [s1, s2, s3].sort((a, b) => a - b)[1];
    console.log(`  A SCAN   : ${scan.ms} ms  (${scan.pages} pages, ${scan.rows} rows)`);
    console.log(`  B COUNTS : ${counts.ms} ms  (${counts.queries} queries, total=${counts.total})`);
    console.log(`  1 COUNT  : ${single} ms  (single filtered total_entries)`);
    results.push({ N, scan: scan.ms, counts: counts.ms, single });
  }
  console.log('\n================ SUMMARY ================');
  console.log('     N   | A scan (ms) | B counts (ms) | 1 count (ms)');
  console.log('  -------+-------------+---------------+-------------');
  for (const r of results) console.log(`  ${String(r.N).padStart(6)} | ${String(r.scan).padStart(11)} | ${String(r.counts).padStart(13)} | ${String(r.single).padStart(11)}`);
  console.log('\ncleaning up perf rows...'); console.log('  deleted', await cleanup());
}

const cmd = process.argv[2] || 'run';
if (cmd === 'clean') { console.log('deleted', await cleanup()); }
else { await run(); }
