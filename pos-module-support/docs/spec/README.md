# pos-module-support — Technical PRD

Build specification for **pos-module-support**: a white-label, PWA-enabled support desk module for platformOS, published in [Platform-OS/pos-modules](https://github.com/Platform-OS/pos-modules). The MVP replaces Zoho Desk for platformOS; partners install the same module in their own apps.

This spec is written for Claude Code as the implementer. Every requirement has an ID, an exact location in the repository, and a way to verify it. Read the files you need for the task at hand, not all of them.

## Where this project lives

This copy of the specification lives in `docs/spec/`; the working copy, PDF exports of the PRD, the prototype source and the research notes are kept in the project's shared drive. The module code lives in git (pos-modules, `pos-module-support`).

## Product documents (the "why")

| Document | Link |
|---|---|
| High-level PRD | https://claude.ai/artifact/TG1um1rM466Xs69ucAY8F5 (PDF: `../PRD/`) |
| Detailed PRD (functional requirements, IDs EM/TK/WS/SL/AS/NT/PW/WL/…) | https://claude.ai/artifact/3BTek1BBXVEPa8kUQuiLRk |
| Clickable prototype (white-label, 11 screens incl. board, team, blocklist) | https://claude.ai/artifact/8p6KHNgsWyXiPom55d1E81 |
| Market research | shared drive: `research/Helpdesk platforms comparison.md` |

When this spec and the detailed PRD disagree, this spec wins for *how*; the detailed PRD wins for *what*. Record any conflict as a decision in `backlog/decisions/`.

## Files in this folder

| File | Read it when |
|---|---|
| [00-tooling-and-practices.md](00-tooling-and-practices.md) | Before the first task: environment, MCP servers, Agent Playbook, the validate → write → deploy → verify loop, and the audit of team practices |
| [01-decisions.md](01-decisions.md) | Before designing anything: the settled decisions (do not reopen) |
| [02-architecture.md](02-architecture.md) | Repository layout, dependencies, request and job flows |
| [03-data-model.md](03-data-model.md) | Writing schema, GraphQL, commands or queries |
| [04-email-sendgrid.md](04-email-sendgrid.md) | Anything that receives or sends email: provider adapters, per-installation setup, the SendGrid adapter |
| [05-tickets-and-workspace.md](05-tickets-and-workspace.md) | Ticket lifecycle, commands, pages, agent UI |
| [06-assignment-and-sla.md](06-assignment-and-sla.md) | Auto-assignment, availability, SLA timers |
| [07-notifications-and-pwa.md](07-notifications-and-pwa.md) | Push, email alerts, preferences, manifest, service worker |
| [08-white-label.md](08-white-label.md) | Layout, CSS, branding hook, anything visual |
| [09-security-permissions-install.md](09-security-permissions-install.md) | Team and access (membership gate, invites, requests), CSRF, secrets, install generator, migrations |
| [10-testing-and-dod.md](10-testing-and-dod.md) | Writing tests; deciding a task is done |
| [11-later-iterations.md](11-later-iterations.md) | Iterations 2–5: GitHub loop, chat/portal, AI via pos-module-mcp |
| [12-gotchas.md](12-gotchas.md) | Before every write — platformOS pitfalls this module will hit |
| [13-delivery-workflow.md](13-delivery-workflow.md) | Repos, tickets, PRs, CI, review, QA deploys, handover to pos-modules |
| [backlog/](backlog/) | The ordered task list (backlog.md format) and decision records |
| [templates/CLAUDE.md](templates/CLAUDE.md) | Copied into the module root in TASK-0 |
| [templates/SKILL.md](templates/SKILL.md) | Shipped with the module so other agents can reuse it |

## How to work through this spec

1. Do TASK-0 (setup) and TASK-1 (spike) first. TASK-1 verifies the four platform behaviours the design depends on; a failure there changes the design, so stop and record a decision before continuing.
2. Take tasks in `ordinal` order from `backlog/tasks/`. Each task lists its dependencies, files, acceptance criteria and tests.
3. Follow the loop in `00-tooling-and-practices.md` for every file. Never `pos-cli deploy`.
4. Close a task only when its acceptance criteria and the Definition of Done in `10-testing-and-dod.md` are met, and write the final summary into the task file.

## Status

| Area | State |
|---|---|
| Product decisions | Settled (see `01-decisions.md`) |
| Open questions | None blocking. Our installation's inbound hostname and departments are chosen at deploy (TASK-27). Agree the module name with JJ's parallel `modules/support` build before the PR to master |
| Last revision | 2026-10-28: standalone `/support-desk` (option C), module-owned access and invites, board, blocklist, secret rotation (D-2, D-12, D-21, D-24..D-28; TASK-29..31) |
| Spikes | TASK-1: multipart inbound, custom Message-ID through SendGrid, JS page for the service worker, `:id` slug params |
