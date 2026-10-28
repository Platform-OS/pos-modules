# 13 — Delivery workflow: feature branch in pos-modules, our instance, then a PR to master

Decision D-20 (revised 2026-10-27): the module is developed in **`Platform-OS/pos-modules`** on the branch **`feature/pos-module-support`**, deployed to **our instance** and checked there. When everything passes, **one PR to `master`** goes to Maciek and Filip for review.

`pos-modules` is public: the branch and its commits are visible, but nobody is asked to review until the PR is opened. To keep the internal phase quiet: no PRs, no issues and no review requests in pos-modules until the final PR.

## 1. Where things live

| What | Where |
|---|---|
| Code | `Platform-OS/pos-modules`, folder `pos-module-support/`, branch `feature/pos-module-support` from `master` |
| Task specs and decisions | `pos-module-support/backlog/` on the branch (backlog.md convention, like pos-module-mcp) |
| Progress board for Artur | private org GitHub Project **"pos-module-support"** with **draft items** (no issues, so nobody is notified); fields Status (Todo, In Progress, Ready to test, Done), Priority (P0–P2), Iteration (MVP, Migration, I2…) |
| Our instance | one staging instance ("SUPPORT-DEV") where every task is deployed and tested by Artur |
| Automated tests | pos-modules' own CI (`.github/workflows/tests.yml`, `lint.yml`) on every push to the branch, using the org's CI instance pool |
| Agent tooling | `.claude/` (Agent Playbook) and `.pos` stay local — the root `.gitignore` already ignores both; `.mcp.json` is added to `.git/info/exclude` |

## 2. The cycle for each task

```
1. draft item → In Progress
2. build on feature/pos-module-support with the loop:
   validate_code → write → deploy-start to SUPPORT-DEV → verify (page, logs-fetch, unit-tests-run)
3. tests written with the code (Liquid unit + Playwright where the task is user-visible)
4. self-review: /code-review and /security-review on the task's diff; fix every finding
5. commit "support: TASK-N <title>" (one or a few commits per task) and push
6. pos-modules CI runs on the push (lint + tests for pos-module-support on a pool instance)
7. CI green → draft item → Ready to test, with "how to test" steps in the item
8. Artur tests on SUPPORT-DEV → Done, or notes what is wrong → back to 2
```

Rules: never push a task whose CI is red; never rewrite pushed history; one task in "Ready to test" at a time unless Artur says otherwise.

## 3. CI wiring (TASK-0, on the branch)

pos-modules runs CI only for modules listed in its root workflows. TASK-0 adds `pos-module-support` there, following the existing entries:

- `.github/workflows/lint.yml`: a `support: 'pos-module-support/**'` paths filter and the matching matrix entry.
- `.github/workflows/tests.yml`: paths filter `support: 'pos-module-support/**'` and a `module-config` entry:
  ```json
  "support": {
    "module": "support",
    "path": "pos-module-support",
    "deploy-script": "./tests/data/seed/seed.sh",
    "test-commands": "pos-cli test run ci\nnpm ci\nnpm run pw-tests"
  }
  ```
- `pos-module-support/tests/data/seed/seed.sh` follows pos-module-user: `pos-cli modules install --dev` → `pos-cli data clean --auto-confirm --include-schema` → `pos-cli deploy` → import seed data (departments, statuses, SLA, test agent/manager/admin profiles with their `team_member` records, one host admin without membership, one disabled member) → `pos-cli deploy -p` of `tests/post_import`.
- Email in CI uses the SendGrid stub (`email_api_base_url` → a capture page under `tests/post_import`), so no real email leaves CI.
- Root `.gitignore`: `pos-module-support/modules/*` and `!pos-module-support/modules/support/` so dependencies are never committed.

These workflow edits are part of the final PR and are reviewed there with everything else.

## 4. Deploying to our instance

- During development: Claude deploys with `deploy-start` (platformos-cli MCP, env `support-dev`), never `pos-cli deploy`.
- The instance is seeded once by running `tests/data/seed/seed.sh support-dev` **without** the data-clean line (a `--keep-data` flag in the script), so Artur's test tickets survive later deploys.
- Artur can redeploy the branch head at any time by asking Claude, or locally with `pos-cli deploy support-dev` from `pos-module-support/` after `pos-cli modules install --dev`.
- Email on SUPPORT-DEV is real: the Settings → Email setup uses the restricted SendGrid key and the test inbound hostname.

## 5. Ready for review → PR to master (TASK-26)

1. All MVP draft items Done; the detailed PRD acceptance list passes on SUPPORT-DEV; Artur signs off.
2. Security review against 09 §2, plus the static gate (`tests/ci-static.sh`) green.
3. Version `0.1.0` in both `pos-module.json` files; CHANGELOG via `changelog-template.hbs`; README complete; `MIGRATIONS.md` started.
4. Open the PR `feature/pos-module-support` → `master` using the module's `pull_request_template.md`, with the spec link, test evidence and the SUPPORT-DEV URL; request Maciek and Filip.
5. After merge: publish the module to the Partner Portal marketplace like the other modules.
