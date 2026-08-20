# Releasing modules

Modules are released to the Partner Portal Marketplace with the interactive
release tool:

```bash
node scripts/release.mjs
```

## Prerequisites

- Node.js >= 20.12 (the script has no npm dependencies)
- `pos-cli` available in `PATH`
- A Partner Portal account with permission to publish the modules
- A reasonably clean working tree — version bumps and lock-file updates are
  committed together at the end, so unrelated local changes will muddy that
  commit

## Walkthrough

1. **Pick modules.** The checklist shows every `pos-module-*` directory that
   contains a `pos-module.json`, with its current version. Modules are listed
   in **release order** (see below) — the loop releases them top to bottom.

   | Key | Action |
   |-----|--------|
   | `↑` / `↓` (or `k` / `j`) | move |
   | `space` | select / deselect |
   | `←` / `→` | cycle bump type: `patch` → `minor` → `major` → `push only` |
   | `a` | toggle all |
   | `enter` | continue |
   | `q` / `esc` / `ctrl-c` | quit |

   `push only` publishes the **current** version without bumping — useful for
   retrying a release whose push failed after the version was already bumped.

2. **Credentials.** You are asked for your Partner Portal email (prefilled
   from `POS_PORTAL_EMAIL` or `git config user.email`) and password (hidden).
   Setting the standard pos-cli env vars skips the prompts:

   ```bash
   export POS_PORTAL_EMAIL=you@example.com
   export POS_PORTAL_PASSWORD=...
   ```

   The password is only ever passed to `pos-cli modules push` via the
   `POS_PORTAL_PASSWORD` environment variable, never on a command line.

3. **Confirm.** The script shows the exact list, order, and target versions,
   and asks before doing anything.

4. **Release loop.** For each selected module, in order:

   ```
   pos-cli modules update --dev              # skipped if the module has no dependencies
   pos-cli modules version <bump> --no-git   # skipped for "push only"
   pos-cli modules push --email <email>
   ```

   - Before `modules update`, any declared range that cannot reach a parent
     released earlier in this run is bumped in `pos-module.json` (e.g.
     `^0.0.13` → `^0.0.14` — npm caret semantics pin `^0.0.x` to that exact
     patch, so the range would otherwise never resolve to the new version).
     Major jumps are never auto-bumped.
   - `modules update` refreshes `pos-module.lock.json` so the published
     archive — and the commit CI checks — reference the parents released
     earlier in the same run.
   - A failed step marks the module as failed and **skips its remaining
     steps**, but the loop continues with the next module.

5. **Dependent sync.** After the loop, every module in the repo that was
   *not* released this run but declares a just-released module in its
   `dependencies` or `devDependencies` gets the same treatment: stale ranges
   bumped (same-major releases only) and `pos-cli modules update <name>` run
   to refresh its lock file. This matters especially for devDependencies —
   they are not part of the release order, so releasing e.g. `oauth_github`
   alone would otherwise leave `pos-module-user`'s lock pinned to the old
   version, and CI (which installs from the frozen lock) would keep checking
   against it.

6. **Commit.** After the summary, the script offers a single combined git
   commit of the `pos-module.json` and `pos-module.lock.json` of every
   released module and every synced dependent
   (e.g. `Release oauth_github@0.0.14; sync user`). Push it so CI picks
   up the lock-file changes. Tags are intentionally **not** created —
   per-module version tags like `2.1.11` would collide in the shared
   monorepo history.

## Release order

Order is a topological sort of the `dependencies` declared in each module's
`pos-module.json`, seeded so the foundation modules come first:

```
common-styling -> core -> user
captchas -> captchas-{hcaptcha,recaptcha,recaptcha3,turnstile}
push-notifications -> chat
payments -> payments-{example-gateway,stripe}
...then the remaining independent modules
```

A parent is always published before its dependents, and `pos-cli modules push`
waits until publishing completes, so each dependent's `modules update` already
sees the parent's fresh version. When releasing a family (payments, captchas,
oauth, …), select the parent and its children in the same run and the ordering
is handled for you.

## Gotchas

- **Major bumps don't propagate automatically.** If you major-bump a parent
  (e.g. core `2.x` → `3.0.0`), dependents declaring `"core": "^2.1.9"` will
  correctly keep resolving to `2.x` — the range auto-bump and dependent sync
  deliberately skip major jumps and print a warning instead. Verify
  compatibility, update the range in each dependent's `pos-module.json` by
  hand, then release the dependents.
- **Version bumps are file-only** (`--no-git`). Until you accept the commit
  offer (or commit manually), the bump exists only in your working tree.
- **A failed module doesn't stop the run.** Check the summary: if a parent
  failed but its dependents succeeded, the dependents were published with
  lock files pointing at the parent's *previous* version. To fix it, release
  the parent, then give each affected dependent a fresh patch release
  (`push only` won't work here — the marketplace already has that version).
- `pos-module.json` is the single source of truth for module metadata.
  The legacy `modules/<machine_name>/template-values.json` files were removed
  (`pos-cli modules migrate`); copies of them that appear under `modules/`
  are vendored dependency downloads — gitignored, never edited by hand.
