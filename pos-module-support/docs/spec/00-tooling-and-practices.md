# 00 — Tooling and practices

## 1. Audit: what the team has shared, and whether this project applies it

Sources searched: Slack messages from Maciek (Maciej Krajowski, CTO), Filip Kłosowski and Adam Broadway to and around Artur, July–October 2026; the pos-modules repository on `master`; the pos-cli README; the platformOS Agent Playbook.

| Practice or tool | Source | Applied before this spec? | Action in this project |
|---|---|---|---|
| `pos-cli ai init` registers the **platformos-cli** MCP (`--profile dev`: check-run, logs-fetch, liquid-exec, graphql-exec, envs-list, deploy-dry-run, deploy-start, job-status, unit-tests-run) and the **platformos-supervisor** MCP (`validate_code`) | Maciek, #inner-circle 2026-07-22 and #engineering 2026-07-17; pos-cli README | **No.** pos-cli 6.6.0 is installed but neither server is registered for Claude Code | TASK-0: run `pos-cli ai init --tool claude --agent-playbook` in the module root |
| **platformOS Agent Playbook** (`.claude/`: rules per directory, knowledge files, `platformos-coding-agent`, diagnostics hook on `validate_code`) | pos-cli README ("The platformOS Agent Playbook"); installed by `ai init` | **No** | TASK-0 installs it; its rules are binding (section 3) |
| platformOS Liquid and GraphQL documentation MCPs (`platformos-liquid`, `platformos-graphql`) | Filip, #engineering 2026-08-04 ("knowledge layer"); pos-cli README | **Yes** (registered user-wide, used to verify this spec) | Keep. Look up every tag, filter and GraphQL field before using it |
| platformos-check / language server 1.2 (`pos-cli check run`) | Maciek, #eng-core 2026-10-26 (release tags) | Partly (runs inside deploys) | Run `check-run` on every changed file; zero offences is part of DoD |
| Layered agent model: supervisor = guard, pos-cli MCP = effector/oracle, backlog.md = provenance, docs MCPs = knowledge | Filip, #engineering 2026-08-04 | No | This spec adopts it: validate with supervisor, act with pos-cli MCP, record in `backlog/` |
| **backlog.md** convention (`backlog/tasks`, `backlog/decisions`, spike-first, Definition of Done in config) | Filip ("our convention"); pos-module-mcp/backlog | No | `backlog/` in this folder is the task list; copied into the module in TASK-0 |
| Per-module `CLAUDE.md` describing what is specific to the module (pos-module-chat pattern) | pos-modules repo | No | `templates/CLAUDE.md` |
| Module usable by AI as a reference, "a Module that Claude can refer to in its SKILLS.MD" | Adam, DM 2026-09-14 and #support thread 2026-10-21 | No | Ship `SKILL.md` (TASK-24) |
| **pos-module-mcp** (governed MCP server: OAuth 2.1, named policies, approval gate, ledger) — verified working with Claude, ChatGPT and Grok | Filip, #general 2026-10-23; pos-modules master | No | Iterations 4–5 expose support tools through it (`11-later-iterations.md`) |
| pos-module-push-notifications, pos-module-chat (patterns) | pos-modules master | — | Push is an MVP dependency; chat is the reference for WebSocket channels, consumers and uploads. pos-module-websocket is not on the marketplace, so it is not used (decision-11) |
| pos-bridge MCP (`cit-dev-*` build instances) | Filip, DM 2026-10-15 | Yes (registered) | **Not used here.** It builds apps on a bridge instance; this module is developed as code in pos-modules |
| Cloudflare `security-audit-skill` | Maciek, #engineering 2026-09-17 | No | Optional pre-release security review (TASK-26); read the skill before installing it |
| Shopify Liquid skill | Maciej W., #eng-core 2026-09-16 | — | **Do not use.** platformOS Liquid is not Shopify Liquid; it teaches wrong syntax |
| UI/UX skills (frontend-design, impeccable, ui-ux-pro-max) | Installed as Claude Code skills | Yes (prototype) | Use `impeccable` *Operate* mode guidance only where it agrees with common-styling |

## 2. Environment (TASK-0)

```bash
# 1. Feature branch in pos-modules (13-delivery-workflow.md)
cd pos-modules
git fetch origin && git switch -c feature/pos-module-support origin/master

# 2. Scaffold pos-module-support/ following pos-module-user (the most complete module) — see 02 §2 for the full file list
#    and add the module to the root .gitignore, .github/workflows/lint.yml and tests.yml (13 §3)
cd pos-module-support

# 3. AI tooling, from the repo root
npm install -g @platformos/pos-cli@latest           # 6.6.0 is installed; the docs servers and the Playbook option arrived in 6.7+
pos-cli --version
pos-cli ai init --tool claude --agent-playbook      # .mcp.json + .claude/ (Playbook); docs servers already registered user-wide
cp ../../support-desk/tech-spec/templates/CLAUDE.md ./CLAUDE.md
cp -R ../../support-desk/tech-spec/backlog ./backlog

# 4. Environments
pos-cli env add support-dev --url https://<our instance>   # our staging instance, never production
echo '.mcp.json' >> ../.git/info/exclude                       # .claude/ and .pos are already in the root .gitignore
```

Instances: **our instance** (`support-dev`, staging) for development and Artur's testing; pos-modules' CI pool for automated tests; our production installation later (TASK-27). In the Partner Portal, **enable API call notifications for staging** on our instance, or SendGrid calls are silently not sent.

Node: use `/opt/homebrew/opt/node@22/bin` first on `PATH` (pos-cli needs Node 22 on this machine).

## 3. The loop (binding — from the Agent Playbook)

For every Liquid, GraphQL or YAML file under `modules/` or `app/`:

1. **validate** — `validate_code` (platformos-supervisor) with the exact content, all files that reference each other in one call. Fix everything with `must_fix_before_write: true`.
2. **write** — the `Write` or `Edit` tool. Never shell redirection, heredocs, `sed -i` or `tee` into `modules/` or `app/`.
3. **deploy** — `deploy-start` (platformos-cli MCP) with `env` named explicitly. Never `pos-cli deploy` (it deletes what the project does not contain). A `partial: false` deploy requires `deploy-dry-run { partial: false }` first and reading `deleted`.
4. **verify** — load the URL, run the test (`unit-tests-run`), read `logs-fetch`. A clean `validate_code` is not proof of correctness.

Look up before writing: `liquid_search` → `liquid_tag`/`liquid_filter`; `pos_gql_search` → `pos_gql_type`. Do not recall platformOS syntax from memory.

Report each finished task as `Done / Outcome / Next` in the task file's Final Summary.

## 4. Repository conventions (pos-modules)

- Commands: `lib/commands/<resource>/<action>.liquid` + `build.liquid` + `check.liquid`; execute via `modules/core/commands/execute` or a module GraphQL mutation. Called as `modules/support/commands/<resource>/<action>`.
- Queries: `lib/queries/<resource>/<search|find|…>.liquid`, read-only, one stored operation each.
- Events: `lib/events/<event_name>.liquid` (payload validator) + `lib/consumers/<event_name>/<consumer>.liquid`; publish with `modules/core/commands/events/publish`. Past-tense names, prefixed `support_`.
- Hooks: fire with `modules/core/commands/hook/fire`; implementations are `lib/hooks/hook_<name>.liquid`.
- CSS classes: common-styling `pos-*` only, plus module classes prefixed `pos-support-`. JS on `window.pos.modules`.
- Tables are addressed as `modules/support/<table>` in GraphQL.
- Versioning: semver in `pos-module.json`, `npm run version` updates CHANGELOG.
