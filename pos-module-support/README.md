# Support Desk module

A white-label support desk for platformOS apps. Customers email you; every email becomes or joins a ticket; your team works the queue at `/support-desk` and replies from the ticket. The desk takes the host app's colours, fonts, name and logo, installs as its own app (PWA) with push notifications, and works on any app: one with members and an admin area, or a marketing site with no users at all.

> **Status: in development** on the `feature/pos-module-support` branch. Not yet released to the marketplace.

## What it does (MVP)

- Email to ticket through the email provider you choose at install (SendGrid in the first release), with reliable threading.
- Agent queue (list and board), ticket page with replies and internal notes, saved replies, collision warnings.
- Departments, statuses over six fixed categories, priorities P0–P3 with SLA targets and business hours.
- Least-loaded auto-assignment with an escalation safety net.
- Push and email alerts for agents, each switchable per person.
- Team managed inside the module: pick existing staff or invite people by email; invited outsiders get Support only.
- Blocklist, webhook secret rotation, audit log.

## Installation

```bash
pos-cli modules install support
pos-cli generate run modules/support/generators/install
```

The generator names the first support admin, connects your email provider and wires the branding hooks. Full setup steps will be documented here before the first release.

## Access

The desk is a standalone section at `/support-desk` with its own sign-in at `/support-desk/sign-in`. Access comes only from the module's team membership records, never from the host's roles or permissions file:

- A host user with the `superadmin` role gets an admin membership on their first visit.
- An email listed in the constant `modules/support/ADMIN_EMAILS` (comma-separated) gets an admin membership on first visit; use it to recover access.
- Everyone else signed in sees "You don't have access to Support" with a Request access button.
- A disabled membership is never recreated.

The optional page `admin/support` (permission `admin_pages.view`, `metadata.menu.title: Support`) adds Support to host admin menus built from page metadata and only redirects to `/support-desk`.

## Constants

| Constant | Purpose |
|---|---|
| `modules/support/ADMIN_EMAILS` | comma-separated emails that get an admin membership on first visit (recovery) |
| `modules/support/REPLY_TOKEN_SECRET` | signs the reply token in `Reply-To` addresses; set once at install, never change it on a live desk |
| `modules/support/INBOUND_SECRET` | secret path segment of the inbound webhook URL |

The `role_map` setting (JSON, host role → `agent`/`manager`/`admin`, default `{}`) gives desk access to holders of a host role on their first visit.

## Hooks

| Hook | Return | Used for |
|---|---|---|
| `support_branding` | object: `app_name`, `short_name`, `logo_url`, `logo_dark_url`, `icon_url`, `favicon_url`, `theme_color`, `background_color`, `theme_mode` (`auto`/`light`/`dark`), `support_email_name` | brand in the desk, emails, manifest and push |
| `headscripts` (core) | HTML string | host stylesheet, loaded after the module CSS so host tokens win |

CSS tokens a host can override: `--pos-support-rail-width`, `--pos-support-rail-background`, `--pos-support-rail-text`, `--pos-support-rail-active-background`, `--pos-support-rail-active-text`, `--pos-support-rail-frame`, `--pos-support-monogram-background`, `--pos-support-monogram-text`, plus every common-styling `--pos-*` token.

## Development

- The example host app in `app/` (not distributed) is a marketing site at `/` and a community-style admin area at `/admin` (host roles `superadmin` and `editor`, both with `admin_pages.view`), with a demo theme and branding hooks.
- Tasks and decisions: `backlog/`; progress board: https://github.com/orgs/Platform-OS/projects/28.
- Static checks: `npm run test:static`. Seed an environment: `./tests/data/seed/seed.sh <env> [--keep-data]`.
