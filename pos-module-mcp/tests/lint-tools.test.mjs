/**
 * pos-module-mcp — tool linter (static author-boundary security gate), Vitest.
 *
 * Fully static: reads the app's Layer-2 tool sources (registry + each manifest/handler/
 * query) and flags injection / SSRF / ledger-writes / schema faults the runtime
 * meta-schema cannot see. NO instance, NO network. The analysis lives in
 * ./lib/lint-tools.mjs (also runnable as a CLI); this asserts it stays clean.
 *
 * Default: an ERROR-level finding fails the run (matches the CLI's default). Set
 * LINT_STRICT=1 to also fail on warnings (matches `lint-tools.mjs --strict`).
 *
 * Run:  npx vitest run tests/lint-tools.test.mjs
 */
import { describe, it, beforeAll, expect } from 'vitest';
import { lintAll } from './lib/lint-tools.mjs';

const fmt = (fs) => fs.map((f) => `  [${f.check}] ${f.tool}: ${f.message}\n      ${f.file}`).join('\n');
const STRICT = process.env.LINT_STRICT === '1';

describe('tool linter · author-boundary security gate', () => {
  let res;
  beforeAll(() => { res = lintAll(); });

  it('no ERROR-level findings in tool sources', () => {
    expect(res.errors, `${res.errors.length} error(s):\n${fmt(res.errors)}`).toHaveLength(0);
  });

  it.skipIf(!STRICT)('no WARNING-level findings (LINT_STRICT)', () => {
    expect(res.warnings, `${res.warnings.length} warning(s):\n${fmt(res.warnings)}`).toHaveLength(0);
  });
});
