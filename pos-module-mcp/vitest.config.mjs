import { defineConfig } from 'vitest/config';

// pos-module-mcp test runner.
//
// These are INTEGRATION/e2e suites that drive ONE live platformOS instance over HTTP
// and share mutable server state (the hash-chained ledger `seq`, per-principal rate and
// abuse windows, the approval queue, idempotency records). They therefore MUST run
// strictly serially — no file-level or in-file parallelism — or concurrent suites would
// corrupt each other's expectations. The settings below force a single worker and
// sequential execution; do not relax them without re-thinking state isolation.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.mjs'],
    // ── strict serialization (shared live state) ──
    // fileParallelism:false runs test FILES one at a time; sequence.concurrent:false keeps
    // tests within a file sequential; maxWorkers:1 pins it to a single worker process. Any
    // one of these relaxed would let suites race on the shared ledger/rate/approval state.
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    sequence: { concurrent: false },
    // ── network-bound: generous timeouts (web logins retry with backoff; seeding
    //    re-imports the fixture matrix; some planes deliberately wait out a window) ──
    testTimeout: 120000,
    hookTimeout: 180000,
    // Structured output for CI annotations; plain locally.
    reporters: process.env.CI ? ['default', 'junit'] : ['default'],
    outputFile: { junit: './tests/.vitest-junit.xml' },
  },
});
