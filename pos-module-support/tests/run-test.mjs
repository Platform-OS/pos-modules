// Runs Liquid unit tests by name and prints every failing assertion.
//
//   node tests/run-test.mjs <env> [test name or path fragment]
//   npm run test:one -- support-dev test/support/avatars_test
//
// Why: `pos-cli test run <env> <name>` prints only "Something went wrong on
// the server" when a test fails. The tests module answers a failing run with
// HTTP 500 and the full JSON report in the body; pos-cli (6.x, fetch-based)
// still looks for the report in the old "500 - {json}" error message and
// never finds it. This reads the same endpoint (/_tests/run.js) and prints
// the report. Exit code 1 when any assertion fails.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const [env, name = ''] = process.argv.slice(2);
if (!env) {
  console.error('usage: node tests/run-test.mjs <env> [test name]');
  process.exit(2);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(root, '.pos'), 'utf8'));
const url = process.env.MPKIT_URL || config[env]?.url;
if (!url) {
  console.error(`no environment "${env}" in .pos`);
  process.exit(2);
}

const response = await fetch(new URL(`_tests/run.js?name=${encodeURIComponent(name)}`, url.endsWith('/') ? url : `${url}/`));
const text = await response.text();
let report;
try {
  report = JSON.parse(text);
} catch {
  console.error(`HTTP ${response.status}, not a test report:\n${text.slice(0, 2000)}`);
  process.exit(1);
}
if (report.error && !report.tests) {
  console.error(report.error);
  process.exit(1);
}
for (const t of report.tests || []) {
  console.log(`${t.success ? '✓' : '✗'} ${t.name} (${t.assertions} assertions)`);
  for (const [field, messages] of Object.entries(t.errors || {})) {
    for (const message of [].concat(messages)) console.log(`    ${field}: ${message}`);
  }
}
console.log(`${report.total_tests} tests, ${report.total_assertions} assertions, ${report.total_errors} failed (${report.duration_ms} ms)`);
process.exit(report.success ? 0 : 1);
