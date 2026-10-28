# 02 — Architecture

## 1. Components

```
                         ┌──────────────── platformOS instance ─────────────────────────────┐
 Customer mail client    │  pos-module-support (modules/support)                           │
   │  ▲                  │   pages/api/support/inbound/:provider/:secret ─► inbound_email │
   ▼  │ (reply threads)  │        └─ background: commands/inbound/process                   │
 Email provider─Inbound─►│              ├─ threading  ├─ contacts/orgs  ├─ tickets/messages │
 (per install)◄──Send─────│              └─ events: support_ticket_created / _message_received│
                         │   consumers ─► assignment/auto_assign ─► sla/schedule            │
 Agent browser / PWA ◄──►│   pages/support-desk/**  (own layout, white-label)              │
   (push, channels)      │   consumers ─► notifications/dispatch ─► push | email (SendGrid) │
                         │   uses: core · user · common-styling · push_notifications ·     │
                         │         platformOS channels (Action Cable)                       │
                         └──────────────────────────────────────────────────────────────────┘
 Later: GitHub App (I2) · chat widget (I3) · pos-module-mcp tools + LLM (I4–I5)
```

## 2. Repository layout

```
pos-modules/pos-module-support/          # mirrors pos-module-user, the most complete module
├── CLAUDE.md                     # from templates/CLAUDE.md
├── SKILL.md                      # from templates/SKILL.md (TASK-24)
├── README.md                     # Installation (Prerequisites, Steps, Setup with generator, Managing module files) · Example app · Functionality · Hooks/events · Settings/constants
├── CHANGELOG.md  changelog-template.hbs  MIGRATIONS.md  LICENSE
├── pull_request_template.md
├── .platformos-check.yml         # ignore: "modules/!(support)/**" — lint only our module and app/
├── .gitignore                    # platformos-tools.log, /playwright-report/, .env, test-results/
├── pos-module.json               # dev app: dependencies + devDependencies (tests)
├── pos-module.lock.json
├── package.json                  # postinstall: playwright chromium; pw-tests; test:static
├── playwright.config.ts          # projects: setup (auth), agent, manager, admin
├── .mcp.json  .claude/           # local only (pos-cli ai init + Agent Playbook); not committed
├── backlog/                      # backlog.md tasks + decisions
├── app/                          # example host apps (NOT distributed); TASK-2 switches between two:
│   ├── views/layouts/application.liquid         #  - marketing site: no members, no admin area
│   ├── views/layouts/admin.liquid               #  - community-style: admin role `superadmin`, admin layout that bounces non-admins
│   ├── lib/hooks/hook_headscripts.liquid        # demo host theme
│   ├── lib/hooks/hook_support_branding.liquid   # demo host branding
│   ├── assets/style/host-theme.css
│   └── modules/user/public/lib/queries/role_permissions/permissions.liquid  # the HOST's own roles (superadmin with admin_pages.view); the support module never edits it
├── tests/                        # Playwright specs, pages/ (page objects), fixtures/email/, data/seed/{seed.sh,data.zip}, post_import/ (SendGrid stub, test users), ci-static.sh (module-boundary gate)
└── modules/support/
    ├── pos-module.json           # machine_name support, deps, postInstall message
    ├── generators/install/       # index.js + templates (TASK-23)
    └── public/
        ├── schema/*.yml                          # 03-data-model.md
        ├── graphql/<resource>/<op>.graphql
        ├── api_calls/                            # (none; api_call_send inline)
        ├── emails/                               # not used for ticket mail (SendGrid)
        ├── lib/
        │   ├── commands/<resource>/<action>{,/build,/check}.liquid
        │   ├── queries/<resource>/<op>.liquid
        │   ├── events/support_*.liquid
        │   ├── consumers/support_*/<consumer>.liquid
        │   ├── helpers/{config,categories,branding,email_address,reply_token,sla_clock,…}.liquid
        │   └── hooks/                            # (module exposes hooks; implements none)
        ├── views/
        │   ├── layouts/support.liquid            # white-label shell (08)
        │   ├── pages/support-desk/**            # UI pages (standalone desk, D-2/D-21)
        │   ├── pages/admin/support.liquid       # optional admin-menu entry, redirects to /support-desk
        │   ├── pages/api/support/**              # webhooks
        │   └── partials/support/**               # views + email templates + channels
        ├── assets/{style/pos-support.css, js/pos-support-*.js, icons/}
        ├── translations/en.yml
        └── migrations/                           # seed defaults (statuses, SLA, settings, sweep job)
```

Module code is referenced as `modules/support/<path>` with `public/` and `lib/` dropped, e.g. `function r = 'modules/support/commands/tickets/create'`, `render 'modules/support/queue/row'`.

## 3. Request and job flows

### 3.1 Inbound email (EM-1..EM-10)

1. The provider POSTs to `/api/support/inbound/<provider>/<INBOUND_SECRET>` (SendGrid: multipart form data).
2. Page `pages/api/support/inbound.liquid` (`slug: api/support/inbound/:provider/:secret`, `method: post`, `layout: ''`): compares `context.params.secret` to the constant in constant time-ish (`compute_hmac` both and compare); on mismatch `response_status 404`. Stores the whole param set as JSON in `inbound_email` (`state: received`), then `background job_id = 'modules/support/commands/inbound/process', inbound_email_id: id, max_attempts: 3`, answers 200 with an empty body. No other work in the request.
3. `commands/inbound/process`: adapter `parse_inbound` → normalized email → loop/spam checks → thread match (04 §3) → find or create contact and organization → create ticket (if new) → create message (+attachments) → mark `inbound_email.state = processed` with `match_reason` → publish `support_ticket_created` or `support_message_received`.
4. Consumers: `assign_new_ticket` (06), `schedule_sla` (06), `send_acknowledgement` (04 §5), `notify_agents` (07), `broadcast_queue_update` (websocket).

### 3.2 Agent reply (EM-11..EM-17)

1. POST `/support-desk/tickets/:id/messages` with CSRF token → `commands/messages/create_reply` (build/check/execute) creates the message with `delivery_state: queued` and publishes `support_reply_created`.
2. Consumer `send_reply_email` calls `commands/email/send` (SendGrid) and updates `delivery_state`, `email_message_id`.
3. Status change ("then: Waiting on customer") is a separate command call in the same request, after the message is stored.

### 3.3 Timers

- `sla/schedule` enqueues `background` jobs at `due − 15 min` and at `due` for the ticket's next SLA deadline; each job re-reads the ticket and exits if the deadline moved (`sla_version` mismatch).
- `sweep` job (`commands/maintenance/sweep`) runs every 5 minutes by re-enqueuing itself with `delay: 5`; it closes Confirmation tickets older than the auto-close period, escalates unassigned tickets (AS-4) and repairs missed SLA jobs. Started by a migration; a `sweep_heartbeat` setting row lets the UI show a warning if it stops.

## 4. Dependencies (`modules/support/pos-module.json`)

```json
{
  "machine_name": "support",
  "name": "Support Desk",
  "version": "0.1.0",
  "dependencies": {
    "core": "^2.1.9",
    "user": "^5.2.12",
    "common-styling": "^1.38.5",
    "push_notifications": "^2.0.2"
  },
  "postInstall": {
    "message": "support installed.\n\nRun the install generator to add roles, the host theme hook, SendGrid and push keys:\n\n  pos-cli generate run modules/support/generators/install\n\nSee README: https://github.com/Platform-OS/pos-modules/blob/master/pos-module-support/README.md"
  }
}
```

Check the current versions on master when starting; use the latest minor of each.

## 5. Pages and endpoints

The desk is a **standalone section at `/support-desk`**, not part of the host's admin (D-21). Every desk page uses the module layout and the module's own access gate (D-24):

```liquid
---
slug: support-desk
layout: modules/support/support
metadata:
  permission: "support.tickets.read"
---
{% liquid
  # resolves the signed-in profile's support membership (creating it on first visit for superadmin or a mapped host role, D-24),
  # redirects anonymous visitors to /support-desk/sign-in, and answers 403 with the "Request access" page for a non-member
  function member = 'modules/support/helpers/require_member', permission: context.page.metadata.permission
  …
%}
```
`require_member` wraps `modules/user/helpers/can_do_or_unauthorized` with `access_callback: 'modules/support/can/desk'`, so the check runs through the user module's RBAC entry point but is decided by the membership record, never by host roles or the host's permissions file. It cannot use the helper's own anonymous redirect, which always goes to the host's `/sessions/new`.

**Admin menu entry (optional, installed by default):** one page `pages/admin/support.liquid` (`slug: admin/support`, `metadata: { menu: { title: "Support" }, permission: "admin_pages.view", relative_path: "/admin/support" }`) that only redirects to `/support-desk`. Hosts that build their admin menu from `admin_pages` with `metadata.menu` (e.g. platformOS Community) list Support automatically; it never renders desk content, so a host admin layout that bounces non-admins does not affect support-only agents. The generator can remove it.

| Slug | Method | Format | Layout | Permission | CSRF | File |
|---|---|---|---|---|---|---|
| `support-desk` | get | html | `modules/support/support` | `support.tickets.read` | — | `pages/support-desk/index.liquid` (queue, list view) |
| `support-desk/board` | get | html | support | `support.tickets.read` | — | board view (05 §3) |
| `support-desk/board/move` | post | html (redirect) / json | — | `support.tickets.reply` | yes | change status from the board |
| `support-desk/sign-in` | get/post | html | support | public | yes | desk sign-in; POST calls `modules/user/commands/session/create` (2FA via the user module's verify partial) |
| `support-desk/invites/:id` | get/post | html | support | invite token | yes | set password and join (D-25) |
| `support-desk/request-access` | post | html | — | signed in, not a member | yes | creates an access request, notifies support admins |
| `support-desk/tickets/:id` | get | html | support | `support.tickets.read` + department scope | — | `pages/support-desk/tickets/show.liquid` |
| `support-desk/tickets/:id/messages` | post | html (redirect) / json | — | `support.tickets.reply` | yes | `…/tickets/messages/create.liquid` |
| `support-desk/tickets/:id/update` | post | json | `''` | `support.tickets.reply` | yes | status, priority, assignee, department, tags, snooze |
| `support-desk/tickets/:id/merge` | post | json | `''` | `support.tickets.manage.all` | yes | |
| `support-desk/tickets/bulk` | post | json | `''` | `support.tickets.reply` (+manage.all for others' tickets) | yes | |
| `support-desk/tickets/new` | get/post | html | support | `support.tickets.reply` | yes | agent-created ticket |
| `support-desk/contacts/:id`, `organizations/:id` | get/post | html | support | `support.tickets.read` / `reply` | yes | |
| `support-desk/profile` | get/post | html | support | `support.tickets.read` | yes | availability, notification prefs, devices |
| `support-desk/settings/<section>` | get/post | html | support | `support.settings.manage` | yes | departments, statuses, sla, hours, templates, saved-replies, team, blocklist, assignment, branding, email, integrations |
| `support-desk/manifest.json` | get | json | `''` | public | — | PWA manifest (07) |
| `support-desk/sw.js` | get | js (SPIKE) | `''` | public | — | service worker (07) |
| `support-desk/search.json` | get | json | `''` | `support.tickets.read` | — | quick search |
| `admin/support` | get | — | `''` | `admin_pages.view` (host) | — | optional admin-menu entry; redirects to `/support-desk` |
| `api/support/inbound/:provider/:secret` | post | — | `''` | secret | no session | provider inbound webhook (SendGrid Inbound Parse in the MVP) |
| `api/support/email-events/:provider/:secret` | post | json | `''` | secret | no session | provider delivery events (SendGrid Event Webhook; Should) |

Rules: `method: post` lowercase; no leading slash in slugs; never a query param named `slug` or `action`; JSON pages use `format: json`; layoutless pages use `layout: ''`.
