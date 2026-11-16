// Static checks run by tests/ci-static.sh:
//   1. every translation key the module uses by name exists in en.yml;
//   2. every event the module publishes and every hook it fires is named in README.md;
//   3. every settings key the code reads (settings.<key>) is named in README.md.
// Keys built at runtime ('…' | append: …) cannot be checked and are skipped.
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MODULE = path.join(ROOT, 'modules/support/public');
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');

const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'translations') walk(full); }
    else if (/\.(liquid|js)$/.test(entry.name)) files.push(full);
  }
})(MODULE);
const sources = files.map((f) => [path.relative(ROOT, f), fs.readFileSync(f, 'utf8')]);

// en.yml as a set of dotted keys (indentation-based; the file is plain nested maps)
const keys = new Set();
const stack = [];
for (const line of fs.readFileSync(path.join(MODULE, 'translations/en/en.yml'), 'utf8').split('\n')) {
  // keys may be quoted ("on": YAML would read a bare on/off as a boolean)
  const m = line.match(/^( *)(?:"([A-Za-z0-9_-]+)"|([A-Za-z0-9_-]+)):/);
  if (!m) continue;
  const depth = m[1].length / 2;
  stack.length = depth;
  stack[depth] = m[2] || m[3];
  keys.add(stack.slice(1).join('.')); // drop the top-level "en"
}

const problems = [];

// 1. translation keys: 'modules/support/a.b.c' | t (a key ending in _ or . is a runtime prefix)
for (const [file, text] of sources) {
  for (const m of text.matchAll(/'modules\/support\/([a-z0-9_]+(?:\.[a-z0-9_]+)+)'\s*\|\s*t(?:_escape)?\b/g)) {
    if (!keys.has(m[1])) problems.push(`${file}: translation key modules/support/${m[1]} is not in en.yml`);
  }
}

// 2. events and hooks
const events = new Set();
const hooks = new Set();
for (const [, text] of sources) {
  for (const m of text.matchAll(/events\/publish',\s*type:\s*'([a-z_]+)'/g)) events.add(m[1]);
  for (const m of text.matchAll(/hook\/(?:fire|alter)',\s*hook:\s*'([a-z_]+)'/g)) hooks.add(m[1]);
}
for (const name of events) if (!readme.includes(name)) problems.push(`README.md does not document the event ${name}`);
for (const name of hooks) if (!readme.includes(name)) problems.push(`README.md does not document the hook ${name}`);

// 3. settings keys read through helpers/settings
const settings = new Set();
for (const [, text] of sources) {
  // a variable named settings (helpers/settings), not the 'modules/support/settings.*' translations
  for (const m of text.matchAll(/(?<![\/\w.])settings\.([a-z][a-z0-9_]*[a-z0-9])\b(?!')/g)) settings.add(m[1]);
}
for (const name of settings) if (!readme.includes(name)) problems.push(`README.md does not mention the setting ${name}`);

if (problems.length) {
  console.log(problems.map((p) => `check-docs: ${p}`).join('\n'));
  process.exit(1);
}
console.log(`check-docs: ok (${keys.size} translation keys, ${events.size} events, ${hooks.size} hooks, ${settings.size} settings)`);
