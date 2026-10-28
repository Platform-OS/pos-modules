# CLAUDE.md

This file guides Claude Code in **pos-module-support**. The monorepo-wide conventions (command pattern, hooks, events, RBAC, module overrides, naming) are in `../CLAUDE.md`; the platformOS rules are in `.claude/` (Agent Playbook). This file covers only what is specific to this module.

## What this module does

A white-label support desk for platformOS apps: email tickets through the email provider each installation configures at deploy (provider adapters; SendGrid in the MVP), threading, agent queue and ticket pages under `/support-desk`, least-loaded auto-assignment, SLA timers, push and email alerts, and an installable PWA scoped to `/support-desk/`. The full specification is in `docs/spec/` (00–13; gotchas in `12-gotchas.md`); the task list is in `backlog/` and on the GitHub Project https://github.com/orgs/Platform-OS/projects/28. `README.md` is the installer's guide (constants, settings, hooks, events, troubleshooting) and `SKILL.md` the short version for agents; keep both in step with the code when hooks, events, constants or settings change.

`modules/support/` is the distributed module, including the install generator in `modules/support/generators/install/` (idempotent; its instance side is `queries/install/state` and `commands/install/apply`). `app/` is an example host app (permissions override, host theme hook, branding hook, test helpers in `app/lib/support_test_helpers/`, unit tests in `app/lib/test/support/`) and `tests/` holds the static checks, fixtures and the E2E suite; neither ships.

## The loop (required)

validate (`validate_code`, platformos-supervisor) → write (Write/Edit only) → deploy (`deploy-start`, platformos-cli, env named) → verify (load URL, `unit-tests-run`, `logs-fetch`). Never `pos-cli deploy`. Never write into `modules/` or `app/` from the shell. Look up Liquid and GraphQL with the platformos-liquid / platformos-graphql MCP servers instead of recalling them.

## Things that are specific here

- Tables are `modules/support/<table>`; every ticket write goes through `modules/support/commands/tickets/*` and writes a `ticket_event`.
- Status behaviour comes from the **category** (`lib/helpers/categories.liquid`), never from a status key.
- Department scope is applied in every query; every by-id write loads the record through a scoped query first.
- Every POST under `support-desk` checks `context.csrf_request_valid`. Webhooks under `api/support` authenticate by the secret path segment.
- Styling: common-styling classes and `var(--pos-*)` tokens only; module classes `pos-support-*`; semantic status/priority/SLA tokens in `pos-support.css` are the only hex values.
- Branding comes from `modules/support/helpers/branding` (override → `support_branding` hook → defaults). Never hardcode a product name, logo or colour.
- Email: never hardcode a provider, domain, address or key — they come from settings and constants set at install. All sending goes through `commands/email/send`, which dispatches to the configured adapter. Every outgoing message stores its `Message-ID` before sending and carries the signed reply token in `Reply-To`. Customer emails never include internal notes.
- CI lint fails on any platformos-check warning, not only errors: `pos-cli check run` must report no offenses before a push. A form that posts to a page that does not exist yet (MissingPage) counts.
- `constant_set` hides other constants for the rest of the request in some contexts: write constants last. Settings are read once per request through `helpers/settings` (memo in `context.exports`, cleared by `commands/settings/set`).
- A GraphQL filter given a null or empty value is ignored, so `search, id: blank` returns the first record of the table. Every by-id lookup from a form value checks for blank first.
- Timers are delayed `background` jobs keyed by `sla_version`; the sweep job re-enqueues itself every 5 minutes.
- Notifications go through `commands/notifications/dispatch`; preferences default to on when a key is missing. Tickets in an inactive department notify nobody and send no customer email (the test fixtures use the inactive department `testfixtures`).
- A page that answers JSON to `fetch` must use `layout: ''`, or the layout wraps the body; `context.headers.HTTP_ACCEPT` is not reliable, so the board posts `respond=json`. Output JSON with `| json | html_safe`.
- Blocklist (D-27): inbound rule 0 in `commands/inbound/store` refuses blocked senders before anything is stored; Mark as spam (`commands/tickets/mark_spam`) blocks the address only, never the domain.

## Work tracking

Work happens on `feature/pos-module-support` in pos-modules; no PRs, issues or review requests until the final PR to `master` (D-20); progress is tracked on GitHub Project 28. Deploy to `support-dev` with `deploy-start`; push only when CI for the task will be green. The desk is a standalone section at `/support-desk` (D-2, D-21): every page uses `layout: modules/support/support`, declares `metadata.permission` and starts with `modules/support/helpers/require_member`; access comes only from `team_member` records (D-12, D-24), never from host roles or the host's permissions file. The only page under `admin/` is the optional menu entry that redirects to the desk. People are profile ids (D-22).

Tasks and decisions are in `backlog/` (backlog.md format). Take the lowest open `ordinal` whose dependencies are Done. Finish with the Definition of Done in `backlog/config.yml` and a `Done / Outcome / Next` final summary.

## Live updates

Use platformOS's own WebSocket channels (`views/partials/channels/<channel>/{subscribed,receive}.liquid`), as pos-module-chat does. pos-module-websocket is not published to the marketplace yet, so it is not a dependency (decision-11).
