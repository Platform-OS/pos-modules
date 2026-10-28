# 07 — Notifications and the /support-desk PWA

Requirements: NT-1..NT-25, PW-1..PW-8. Decisions D-9, D-10.

## 1. Event → recipients → channels

Consumer `lib/consumers/<event>/notify_agents.liquid` calls `commands/notifications/dispatch` with `event_key`, `ticket_id`, `recipient_ids`, `actor_id`.

| event_key | Trigger event | Recipients (minus the actor) |
|---|---|---|
| `new` | `support_ticket_created` | agents whose `department_ids` include the ticket's department + users with `support.tickets.manage.all` |
| `assigned` | `support_ticket_assigned` | new assignee |
| `reply` | `support_message_received` (not auto-reply) | assignee; if none → `new` recipients |
| `mention` | `support_note_created` with mentions | mentioned users |
| `sla_due` | `support_sla_due_soon` | assignee; unassigned → managers |
| `sla_breach` | `support_sla_breached` | assignee + managers |
| `unassigned` | escalation stage `alert` | managers |
| `access_requested` | `support_access_requested` | support admins |
| `p0` | `support_ticket_created` with priority p0 | managers + department (Should; plus optional Slack webhook from settings) |
| `confirm_wait` | `support_confirmation_waiting` (keep-open mode only, once per ticket) | assignee; unassigned → managers |

`dispatch` for each recipient:
```
prefs   = team_member.notification_prefs (JSON); missing key or channel ⇒ true      (D-10 defaults: all on)
paused  = paused_until > now                                                          (NT-22)
if paused → skip both channels, record ticket_event type "notification_skipped" reason "paused"
push    = prefs[event].push   → push_notifications broadcast (user_ids: [r.user_id]) with payload §2   # push subscriptions are keyed by user id; recipients are profiles (D-22), so pass the profile's user id
email   = prefs[event].email  → commands/email/send with template agent_alert
```
Deduplicate per (recipient, ticket, event_key) within 2 minutes (a `ticket_event` lookup). Customer emails (NT-1..NT-3) never pass through `dispatch` and ignore these preferences (NT-25).

## 2. Push payload

```json
{ "title": "Ticket assigned to you · P1",
  "body": "#18030 Payment receipt emails not sending to applicants",
  "url": "/support-desk/tickets/<id>",
  "tag": "support-<ticket id>-<event_key>",
  "icon": "<brand icon url>", "badge": "<brand badge url>" }
```
No message bodies, no customer email addresses (PW-5). Titles come from translations (`support.notifications.<event_key>.title`).

Sending: `modules/push_notifications/commands/notifications/broadcast` with `user_ids` and `payload`. It queues per subscription in the background and handles 404/410 expiry.

## 3. Profile notification settings (NT-20..NT-24)

Page `support-desk/profile` (GET renders, POST saves with CSRF):
- Availability: Available / Away / Off (06 §1).
- Device card: `{% render 'modules/push_notifications/register' %}` and `{% render 'modules/push_notifications/subscriptions/index', subscriptions: subs %}` (query `modules/push_notifications/queries/subscriptions/search` for the current user). "Send test notification" posts to `support-desk/profile/test_push` and sends a fixed payload to the current user only.
- Matrix: one row per event_key, two switches (push, email). Each switch is a `<button role="switch" aria-checked>` that POSTs `{event_key, channel, value}`; saves immediately; failure reverts the switch and shows an error toast.
- "Pause all" switch + until (1 hour, tomorrow 09:00 in the agent's working-hours zone, until turned on) → `paused_until`.
- "Turn everything on" resets `notification_prefs` to `{}` and clears `paused_until`.
- Admin view (`/support-desk/settings/agents/:profile_id`): read-only matrix + "Reset to defaults".

## 4. PWA scoped to /support-desk (PW-1..PW-8)

### 4.1 Manifest — `pages/support-desk/manifest.liquid`
```liquid
---
slug: support-desk/manifest.json
layout: ''
format: json
---
{% liquid
  function brand = 'modules/support/helpers/branding'
  assign manifest = {
    "name": brand.app_name, "short_name": brand.short_name,
    "id": "/support-desk", "scope": "/support-desk", "start_url": "/support-desk",
    "display": "standalone", "theme_color": brand.theme_color, "background_color": brand.background_color,
    "icons": brand.icons
  }
  echo manifest | json
%}
```
`brand.app_name` = "<Brand> Support"; icons 192 and 512 (PNG required by some platforms; if the host only gives SVG, fall back to the module's generated monogram PNGs in `assets/icons/`). Verified in TASK-1: `slug: support-desk/manifest.json` with `format: json` serves `application/json`.

### 4.2 Service worker — `pages/support-desk/sw.liquid` (SPIKE)
- Target: served at `/support-desk/sw.js` with `Content-Type: application/javascript`, so its default scope is `/support-desk/` and it never controls host pages.
- Content: the push handlers from `modules/push_notifications` `assets/sw.js` (push, notificationclick, pushsubscriptionchange) plus an install/activate handler that caches only the app shell (layout CSS/JS) — no offline ticket data in the MVP (PW-7 is Iteration 3).
- Verified in TASK-1 (decision-9): a module page named `sw.js.liquid` (or `slug: support-desk/sw.js` with `{% response_headers %}`) is served as `application/javascript`, and custom headers such as `Service-Worker-Allowed` pass through. No root fallback is needed. The push module's `init` partial does not pass a scope, so the module registers the worker itself before rendering the push partials.
- Scope is `/support-desk` without the trailing slash (found in TASK-15): the queue lives at `/support-desk`, which a `/support-desk/` scope does not cover, and the manifest's start_url must be inside the scope. The worker answers with `Service-Worker-Allowed: /support-desk`.
- Register in the support layout: `navigator.serviceWorker.register('/support-desk/sw.js?vapid=…&rotate_url=…', { scope: '/support-desk' })` (same URL the push module builds); pass the same path as `service_worker_path` to `{% render 'modules/push_notifications/init', service_worker_path: … %}`.

### 4.3 Install prompts (PW-4)
- After the first sign-in to `/support-desk`, show a dismissible banner: "Get alerts on this device" → Enable push. On iOS Safari not running standalone (`navigator.standalone !== true`), show "Add to Home Screen first" steps instead; iOS allows web push only for installed apps.
- `beforeinstallprompt` (Chromium) powers an "Install Support app" button in the Profile device card.

### 4.4 Keys
VAPID and sender keys are the push module's constants (`modules/push_notifications/*`). The support install generator calls the push module's generator logic when they are missing; it never creates a second key set.
