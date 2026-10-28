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

## Development

- Example host apps live in `app/` and are not distributed.
- Tasks and decisions: `backlog/`; progress board: https://github.com/orgs/Platform-OS/projects/28.
- Static checks: `npm run test:static`. Seed an environment: `./tests/data/seed/seed.sh <env> [--keep-data]`.
