#!/usr/bin/env node
// Interactive release tool for pos-module-* packages.
//
// Lists every pos-module-* directory containing a pos-module.json, lets you
// pick which ones to release and with what semver bump (patch/minor/major,
// or "push only" to publish the current version), then asks for your Partner
// Portal email + password and releases each selected module via:
//
//   pos-cli modules update                    (refresh pos-module.lock.json)
//   pos-cli modules version <bump> --no-git   (skipped for "push only")
//   pos-cli modules push --email <email>      (password via POS_PORTAL_PASSWORD)
//
// Modules are listed and released in dependency order (topological sort of
// the "dependencies" in each pos-module.json, seeded with common-styling,
// core, user first), so a parent module is always published before its
// dependents and each dependent's lock file picks up the fresh version.
//
// After the release loop, every other module in the repo whose dependencies
// or devDependencies reference a just-released module gets its declared range
// bumped (same-major releases only — e.g. ^0.0.13 → ^0.0.14, since npm caret
// semantics pin ^0.0.x to that exact patch) and its pos-module.lock.json
// refreshed, so the committed locks — and CI's frozen installs — reference
// what was actually published.
//
// Bumps use --no-git because modules share this monorepo's git history and
// pos-cli's per-module tags (e.g. "2.1.11") would collide between modules.
// After a successful run the script offers a single combined git commit.
//
// Requires Node.js >= 20.12 (uses node:util styleText). Usage:
//   node scripts/release.mjs

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execSync } from 'node:child_process';
import { styleText } from 'node:util';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUMPS = ['patch', 'minor', 'major', 'push'];

const KEY = {
  ctrlC: '\x03',
  escape: '\x1b',
  backspace: '\x7f',
  up: '\x1b[A',
  down: '\x1b[B',
  right: '\x1b[C',
  left: '\x1b[D',
};

const ansi = {
  clearLine: '\x1b[2K',
  cursorUp: (n) => `\x1b[${n}A`,
  hideCursor: '\x1b[?25l',
  showCursor: '\x1b[?25h',
};

const bumpLabel = {
  patch: styleText('green', 'patch'),
  minor: styleText('yellow', 'minor'),
  major: styleText('red', 'major'),
  push: styleText('cyan', 'push only'),
};

const semverInc = (version, bump) => {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  const [major, minor, patch] = match.slice(1).map(Number);
  switch (bump) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      return version;
  }
};

const parseVersion = (version) => {
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
};

const compareVersions = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

// Minimal matcher for the range shapes used in pos-module.json files
// (^x.y.z, ~x.y.z, >=x.y.z, exact). Follows npm semver semantics — notably
// ^0.0.x matches only that exact patch. Returns null for shapes it does not
// understand so callers can warn instead of guessing.
const rangeIncludes = (range, version) => {
  const v = parseVersion(version);
  const match = String(range).trim().match(/^(\^|~|>=)?\s*(\d+\.\d+\.\d+)$/);
  if (!v || !match) return null;
  const [, op, base] = match;
  const b = parseVersion(base);
  if (compareVersions(v, b) < 0) return false;
  if (op === '>=') return true;
  if (op === '~') return v[0] === b[0] && v[1] === b[1];
  if (op === '^') {
    if (b[0] > 0) return v[0] === b[0];
    if (b[1] > 0) return v[0] === 0 && v[1] === b[1];
    return compareVersions(v, b) === 0;
  }
  return compareVersions(v, b) === 0;
};

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const readManifest = async (dir) => {
  try {
    return JSON.parse(await readFile(path.join(dir, 'pos-module.json'), 'utf8'));
  } catch {
    return null;
  }
};

const readLock = async (dir) => {
  try {
    return JSON.parse(await readFile(path.join(dir, 'pos-module.lock.json'), 'utf8'));
  } catch {
    return null;
  }
};

const discoverModules = async () => {
  const entries = (await readdir(ROOT)).filter((name) => name.startsWith('pos-module-')).sort();
  const modules = await Promise.all(
    entries.map(async (name) => {
      const dir = path.join(ROOT, name);
      const manifest = await readManifest(dir);
      if (!manifest) return null;
      return {
        name,
        dir,
        machineName: manifest.machine_name,
        version: manifest.version,
        dependencyNames: Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }),
        selected: false,
        bump: 'patch',
      };
    })
  );
  return sortByReleaseOrder(modules.filter(Boolean));
};

// Topological sort by declared dependencies, so parents are released before
// their dependents. Seeded with the foundation modules first so the overall
// order starts: tests, common-styling, core, user, then everything else.
// tests goes first so dependents' lock refreshes pick up its fresh version.
const FOUNDATION_ORDER = ['tests', 'common-styling', 'core', 'user'];

const sortByReleaseOrder = (modules) => {
  const seeded = modules.toSorted((a, b) => {
    const rank = (m) => {
      const i = FOUNDATION_ORDER.indexOf(m.machineName);
      return i === -1 ? FOUNDATION_ORDER.length : i;
    };
    return rank(a) - rank(b) || a.name.localeCompare(b.name);
  });

  const byMachineName = new Map(seeded.map((m) => [m.machineName, m]));
  const sorted = [];
  const done = new Set();
  const visit = (m, chain) => {
    if (done.has(m.machineName) || chain.has(m.machineName)) return;
    chain.add(m.machineName);
    for (const dep of m.dependencyNames) {
      const parent = byMachineName.get(dep);
      if (parent) visit(parent, chain);
    }
    chain.delete(m.machineName);
    done.add(m.machineName);
    sorted.push(m);
  };
  for (const m of seeded) visit(m, new Set());
  return sorted;
};

// --- low-level input helpers -------------------------------------------------

// Splits a raw stdin chunk into individual keys — escape sequences (e.g. arrow
// keys) and plain characters can arrive batched in a single chunk.
const tokenizeKeys = (data) => {
  const keys = [];
  let i = 0;
  while (i < data.length) {
    if (data[i] === KEY.escape && data[i + 1] === '[') {
      let end = i + 2;
      while (end < data.length && !/[@-~]/.test(data[end])) end += 1;
      keys.push(data.slice(i, end + 1));
      i = end + 1;
    } else {
      keys.push(data[i]);
      i += 1;
    }
  }
  return keys;
};

const readKeys = (onKey) => {
  let stopped = false;
  process.stdin.setRawMode(true);
  process.stdin.resume();
  const handler = (data) => {
    for (const key of tokenizeKeys(data.toString('utf8'))) {
      if (stopped) break;
      onKey(key);
    }
  };
  process.stdin.on('data', handler);
  return () => {
    stopped = true;
    process.stdin.off('data', handler);
    process.stdin.setRawMode(false);
    process.stdin.pause();
  };
};

const abort = () => {
  process.stdout.write(`${ansi.showCursor}\naborted\n`);
  process.exit(130);
};

const promptText = (question, defaultValue = '') =>
  new Promise((resolve) => {
    const suffix = defaultValue ? styleText('dim', ` [${defaultValue}]`) : '';
    process.stdout.write(`${question}${suffix}: `);
    let buffer = '';
    const stop = readKeys((key) => {
      if (key === KEY.ctrlC) abort();
      if (key === '\r' || key === '\n') {
        process.stdout.write('\n');
        stop();
        resolve(buffer.trim() || defaultValue);
      } else if (key === KEY.backspace || key === '\b') {
        if (buffer.length) {
          buffer = buffer.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else if (key >= ' ') {
        buffer += key;
        process.stdout.write(key);
      }
    });
  });

const promptHidden = (question) =>
  new Promise((resolve) => {
    process.stdout.write(`${question}: `);
    let buffer = '';
    const stop = readKeys((key) => {
      if (key === KEY.ctrlC) abort();
      if (key === '\r' || key === '\n') {
        process.stdout.write('\n');
        stop();
        resolve(buffer);
      } else if (key === KEY.backspace || key === '\b') {
        if (buffer.length) {
          buffer = buffer.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else if (key >= ' ') {
        buffer += key;
        process.stdout.write('*');
      }
    });
  });

const promptYesNo = async (question) => /^y(es)?$/i.test(await promptText(`${question} (y/N)`));

// --- checklist TUI -----------------------------------------------------------

const selectModules = (modules) =>
  new Promise((resolve) => {
    let cursor = 0;
    let linesDrawn = 0;
    const nameWidth = Math.max(...modules.map((m) => m.name.length)) + 2;

    const row = (m, active) => {
      const pointer = active ? styleText('cyan', '❯') : ' ';
      const box = m.selected ? styleText('green', '[x]') : styleText('dim', '[ ]');
      const name = m.name.padEnd(nameWidth);
      let versionInfo = styleText('dim', m.version);
      if (m.selected) {
        versionInfo =
          m.bump === 'push'
            ? `${m.version}  ${bumpLabel.push}`
            : `${m.version} ${styleText('dim', '→')} ${styleText('bold', semverInc(m.version, m.bump))}  ${bumpLabel[m.bump]}`;
      }
      return ` ${pointer} ${box} ${name} ${versionInfo}`;
    };

    const render = () => {
      if (linesDrawn) process.stdout.write(ansi.cursorUp(linesDrawn));
      const lines = [
        styleText('bold', 'platformOS module release') + styleText('dim', ' (listed in release order — dependencies first)'),
        styleText('dim', '  ↑/↓ move · space select · ←/→ bump type · a toggle all · enter continue · q quit'),
        '',
        ...modules.map((m, i) => row(m, i === cursor)),
        '',
      ];
      process.stdout.write(lines.map((line) => `${ansi.clearLine}${line}`).join('\n') + '\n');
      linesDrawn = lines.length;
    };

    process.stdout.write(ansi.hideCursor);
    render();

    const stop = readKeys((key) => {
      if (key === KEY.ctrlC || key === 'q' || key === KEY.escape) {
        stop();
        abort();
      } else if (key === KEY.up || key === 'k') {
        cursor = (cursor - 1 + modules.length) % modules.length;
      } else if (key === KEY.down || key === 'j') {
        cursor = (cursor + 1) % modules.length;
      } else if (key === ' ') {
        modules[cursor].selected = !modules[cursor].selected;
      } else if (key === KEY.right || key === KEY.left) {
        const module = modules[cursor];
        module.selected = true;
        const delta = key === KEY.right ? 1 : -1;
        module.bump = BUMPS.at((BUMPS.indexOf(module.bump) + delta) % BUMPS.length);
      } else if (key === 'a') {
        const allSelected = modules.every((m) => m.selected);
        for (const m of modules) m.selected = !allSelected;
      } else if (key === '\r' || key === '\n') {
        if (!modules.some((m) => m.selected)) return;
        stop();
        process.stdout.write(ansi.showCursor);
        resolve(modules.filter((m) => m.selected));
        return;
      }
      render();
    });
  });

// --- release steps -----------------------------------------------------------

// Rewrite declared ranges in pos-module.json that cannot resolve to a version
// released in this run. Without this, caret ranges anchored at 0.0.x keep
// dependents' lock files on the old version forever (^0.0.13 never matches
// 0.0.14). Major jumps are left alone: compatibility must be verified by hand
// (see RELEASE.md).
const fixDependencyRanges = async (module, released) => {
  const manifest = await readManifest(module.dir);
  if (!manifest) return;
  const file = path.join(module.dir, 'pos-module.json');
  let raw = await readFile(file, 'utf8');
  let changed = false;
  for (const section of ['dependencies', 'devDependencies']) {
    for (const [dep, range] of Object.entries(manifest[section] ?? {})) {
      const release = released.get(dep);
      if (!release || rangeIncludes(range, release.newVersion) === true) continue;
      const from = parseVersion(release.oldVersion);
      const to = parseVersion(release.newVersion);
      const shape = String(range).trim().match(/^([\^~]?)\d+\.\d+\.\d+$/);
      if (!from || !to || from[0] !== to[0] || !shape) {
        console.log(styleText('yellow', `  "${dep}": "${range}" does not cover ${release.newVersion} — update the range by hand`));
        continue;
      }
      const newRange = `${shape[1]}${release.newVersion}`;
      raw = raw.replace(new RegExp(`("${escapeRegExp(dep)}"\\s*:\\s*)"${escapeRegExp(range)}"`), `$1"${newRange}"`);
      console.log(`  ${dep}: range ${range} ${styleText('dim', '→')} ${styleText('bold', newRange)}`);
      changed = true;
    }
  }
  if (changed) await writeFile(file, raw);
};

// After the release loop, other modules in the repo may reference the released
// modules without having been part of the run — devDependencies especially,
// since they are not part of the release order (e.g. user's oauth_github).
// Bump their stale ranges and refresh their lock files so the committed locks
// — and CI's frozen installs — reference what was actually published.
const syncDependents = async (allModules, released) => {
  if (!released.size) return [];
  const synced = [];
  for (const module of allModules) {
    if (released.has(module.machineName)) continue;
    const manifest = await readManifest(module.dir);
    if (!manifest) continue;
    const lock = await readLock(module.dir);
    const stale = [];
    for (const [section, flags] of [['dependencies', []], ['devDependencies', ['--dev']]]) {
      for (const [dep, range] of Object.entries(manifest[section] ?? {})) {
        const release = released.get(dep);
        if (!release) continue;
        const locked = lock?.dependencies?.[dep] ?? lock?.devDependencies?.[dep];
        if (locked === release.newVersion && rangeIncludes(range, release.newVersion) === true) continue;
        stale.push({ dep, flags });
      }
    }
    if (!stale.length) continue;
    process.stdout.write(`\n${styleText('bold', `── ${module.name} ──`)} ${styleText('dim', '(dependent of a released module)')}\n`);
    await fixDependencyRanges(module, released);
    let ok = true;
    for (const { dep, flags } of stale) {
      const update = spawnSync('pos-cli', ['modules', 'update', dep, ...flags], { cwd: module.dir, stdio: 'inherit' });
      if (update.status !== 0) ok = false;
    }
    synced.push({ ...module, ok });
  }
  return synced;
};

const releaseModule = async (module, email, password, released) => {
  process.stdout.write(`\n${styleText('bold', `── ${module.name} ──`)}\n`);

  // Refresh dependencies + pos-module.lock.json so the published archive (and
  // the eventual git commit CI checks) references the just-released parents.
  // Ranges that cannot reach a parent released earlier in this run (^0.0.x)
  // are bumped first so the update can pick it up.
  if (module.dependencyNames.length) {
    await fixDependencyRanges(module, released);
    const update = spawnSync('pos-cli', ['modules', 'update', '--dev'], { cwd: module.dir, stdio: 'inherit' });
    if (update.status !== 0) return { ...module, ok: false, stage: 'dependency update' };
  }

  if (module.bump !== 'push') {
    const bump = spawnSync('pos-cli', ['modules', 'version', module.bump, '--no-git'], {
      cwd: module.dir,
      stdio: 'inherit',
    });
    if (bump.status !== 0) return { ...module, ok: false, stage: 'version bump' };
    module.newVersion = (await readManifest(module.dir))?.version ?? semverInc(module.version, module.bump);
    console.log(styleText('green', `version bumped to ${module.newVersion}`));
  } else {
    module.newVersion = module.version;
  }

  const push = spawnSync('pos-cli', ['modules', 'push', '--email', email], {
    cwd: module.dir,
    stdio: 'inherit',
    env: { ...process.env, POS_PORTAL_PASSWORD: password },
  });
  if (push.status !== 0) return { ...module, ok: false, stage: 'push' };
  return { ...module, ok: true };
};

const offerGitCommit = async (results, synced) => {
  const released = results.filter((r) => r.ok);
  if (!released.length) return;
  try {
    execSync('git rev-parse --git-dir', { cwd: ROOT, stdio: 'pipe' });
  } catch {
    return;
  }

  // Version bumps touch pos-module.json; the update step touches
  // pos-module.lock.json (even for "push only" releases). The dependent sync
  // can touch both files of modules that were not released themselves.
  const files = [...released, ...synced]
    .flatMap((r) => [
      path.join(r.name, 'pos-module.json'),
      path.join(r.name, 'pos-module.lock.json'),
    ])
    .filter((f) => existsSync(path.join(ROOT, f)));
  const quoted = files.map((f) => `'${f}'`).join(' ');

  const dirty = execSync(`git status --porcelain -- ${quoted}`, { cwd: ROOT, stdio: 'pipe' })
    .toString()
    .trim();
  if (!dirty) return;

  console.log();
  if (!(await promptYesNo('Commit version bumps and lock files to git?'))) return;

  const dirtyDirs = new Set(dirty.split('\n').map((line) => line.slice(3).split('/')[0]));
  const syncedNames = synced.filter((s) => dirtyDirs.has(s.name)).map((s) => s.machineName);
  const message =
    `Release ${released.map((r) => `${r.machineName}@${r.newVersion}`).join(', ')}` +
    (syncedNames.length ? `; sync ${syncedNames.join(', ')}` : '');
  try {
    execSync(`git add ${quoted}`, { cwd: ROOT, stdio: 'inherit' });
    execSync(`git commit -m '${message}'`, { cwd: ROOT, stdio: 'inherit' });
  } catch {
    console.log(styleText('red', 'git commit failed — commit manually.'));
  }
};

// --- main --------------------------------------------------------------------

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('This script is interactive and requires a TTY.');
  process.exit(1);
}
if (spawnSync('pos-cli', ['-V'], { stdio: 'pipe' }).error) {
  console.error('pos-cli not found in PATH.');
  process.exit(1);
}

const modules = await discoverModules();
if (!modules.length) {
  console.error(`No pos-module-* directories with pos-module.json found in ${ROOT}`);
  process.exit(1);
}

const selected = await selectModules(modules);

const defaultEmail =
  process.env.POS_PORTAL_EMAIL ||
  execSync('git config user.email', { cwd: ROOT, stdio: 'pipe' }).toString().trim();
const email = await promptText('Partner Portal email', defaultEmail);
if (!email) {
  console.error(styleText('red', 'Email is required.'));
  process.exit(1);
}
const password = process.env.POS_PORTAL_PASSWORD || (await promptHidden('Partner Portal password'));
if (!password) {
  console.error(styleText('red', 'Password is required.'));
  process.exit(1);
}

console.log(`\nReleasing ${selected.length} module(s) in this order as ${styleText('bold', email)}:`);
for (const m of selected) {
  const target = m.bump === 'push' ? m.version : semverInc(m.version, m.bump);
  console.log(`  • ${m.name}  ${m.version} → ${styleText('bold', target)}  (${bumpLabel[m.bump]})`);
}
if (!(await promptYesNo('\nProceed?'))) abort();

const results = [];
const released = new Map();
for (const m of selected) {
  const result = await releaseModule(m, email, password, released);
  results.push(result);
  if (result.ok) released.set(result.machineName, { oldVersion: result.version, newVersion: result.newVersion });
}

const synced = await syncDependents(modules, released);

console.log(`\n${styleText('bold', 'Summary')}`);
for (const r of results) {
  console.log(
    r.ok
      ? `  ${styleText('green', '✔')} ${r.name} ${styleText('dim', 'released as')} ${styleText('bold', r.newVersion)}`
      : `  ${styleText('red', '✖')} ${r.name} ${styleText('red', `failed at ${r.stage}`)}`
  );
}
for (const s of synced) {
  console.log(
    s.ok
      ? `  ${styleText('green', '✔')} ${s.name} ${styleText('dim', 'dependency ranges/lock synced')}`
      : `  ${styleText('red', '✖')} ${s.name} ${styleText('red', 'dependency sync failed — fix with pos-cli modules update')}`
  );
}

await offerGitCommit(results, synced);
process.exit(results.every((r) => r.ok) && synced.every((s) => s.ok) ? 0 : 1);
