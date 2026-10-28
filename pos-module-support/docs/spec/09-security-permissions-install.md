# 09 — Security, permissions and installation

## 1. Access and team (D-12, D-24, D-25)

### 1.1 What each support role can do

| Permission | agent | manager | admin |
|---|---|---|---|
| `support.tickets.read` (own departments) | ✓ | ✓ | ✓ |
| `support.tickets.reply` | ✓ | ✓ | ✓ |
| `support.tickets.manage.all` (all departments, assign anyone, merge, bulk on others' tickets) | | ✓ | ✓ |
| `support.reports.view` | | ✓ | ✓ |
| `support.team.manage` (invite, approve requests, change roles, disable) | | | ✓ |
| `support.settings.manage` (incl. Email, Blocklist) | | | ✓ |

The map lives in the module (`lib/queries/team/role_permissions.liquid`), never in the host's permissions file. Admins see every department.

### 1.2 The gate — `helpers/require_member`

```
profile = modules/user/helpers/current_profile
anonymous            → session return_to; redirect /support-desk/sign-in
member = team_members/find(profile.id)
member missing:
  profile.roles contains superadmin              → create {role: admin,  source: superadmin}
  setting.role_map maps one of profile.roles     → create {role: mapped, source: role_map}
  profile email in constant ADMIN_EMAILS         → create {role: admin,  source: recovery}
  else                                           → 403 + "You don't have access to Support" (+ Request access, D-24)
member.state != active  → 403 + same page (disabled members cannot request again; invited members are told to use their email link)
can = modules/user/helpers/can_do_or_unauthorized, requester: profile, do: <page permission>,
      access_callback: 'modules/support/can/desk', entity: { member, ticket? }
```
- `can/desk` returns true only if the member's role grants the permission and, for a ticket entity, the ticket's department is in `member.department_ids` (or role is admin/manager for `manage.all`).
- Auto-created memberships (superadmin, role map, recovery) are written once and audited as `team_member_created`; **a disabled membership is never recreated** by these paths.
- Host roles grant nothing on their own: a host `admin` without membership sees the no-access page.

### 1.3 Who counts as "existing staff" (Pick existing staff tab)

`setting.staff_roles` — default: every role in `modules/user/queries/role_permissions/permissions` whose list contains `admin_pages.view`, plus `superadmin`. This works whatever the role is called (`admin` in the user module default, `superadmin` in platformOS Community). Admins can edit the list. If it resolves to no profiles, the tab is hidden and only Invite by email shows.

### 1.4 Invites (D-25)

1. `commands/team/invite(email, role, department_ids, actor)`:
   - email belongs to an existing user → membership `{state: active, source: invite}` at once; email "You've been added to <Brand> Support" with a link to `/support-desk`.
   - no user → `modules/user/commands/user/create` with **`roles: []`** (explicit empty array; `null` would apply `USER_DEFAULT_ROLE`) and a random 32-char password; membership `{state: invited}`; `team_invite` with a random token (only its sha256 digest is stored), `expires_at` +7 days; email with `/support-desk/invites/<id>?token=<token>`.
   - refused: invalid email, already an active member, actor lacks `support.team.manage`, more than 50 invites per hour.
2. `/support-desk/invites/:id` GET checks token digest (constant-time compare), not expired, not accepted, not revoked → set-password form (name, password ≥ 12 chars). POST (CSRF) sets the password with `modules/user/user/update`, marks accepted, membership `active`, creates the session with `modules/user/commands/session/create`, redirects to `/support-desk`. Any failure → the same generic "This invitation link is no longer valid" page.
3. Resend creates a new token and revokes the old; Revoke cancels the invite and disables the invited membership.

### 1.5 Request access, disable, offboarding

- Request access: `commands/team/request_access(profile, note)` → `access_request` pending → notify support admins (push + email, event `access_requested`). Approve = choose role + departments → membership `{source: request}`; Decline notifies the requester.
- Disable: `state: disabled` takes effect on the next request (the gate reads the record every time); open tickets are re-assigned by least-loaded (06 §2) with reason "previous assignee disabled"; their push subscriptions for the desk are deleted; history keeps their name.
- The last active admin cannot be disabled or demoted.
- Every team change writes an audit row in `ticket_event` with blank `ticket_id` and `event_type` `team_invited|team_joined|team_role_changed|team_disabled|team_request_*`.

### 1.6 Other enforcement

- Every desk page declares `metadata.permission` and starts with `require_member`; the static gate fails the build otherwise.
- Data: department scope in every query (05 §2); every by-id write loads the record through a scoped query first and refuses on a miss.
- Consumers have no signed-in user: they load the member by profile id and call `can/desk` directly.
- WebSocket channel handlers (`channels/support/subscribed` and `receive`) each check membership and scope; a subscription is authorized only when it opens, so `receive` and the broadcasting consumers re-check.
- Sign-in: `/support-desk/sign-in` calls `modules/user/commands/session/create`; when it returns `otp_required` the user module's 2FA verify partial is rendered. 2FA is recommended for support admins (shown as a banner until set up), not forced in the MVP.

## 2. Request safety (D-23, modelled on pos-module-mcp's security model)

- **Deny by default**: a page without `metadata.permission` and the `can_do_or_unauthorized` include is a bug; the static gate (`tests/ci-static.sh`) fails the build if any `views/pages/support-desk/**` file lacks either.
- **Fail closed**: a missing record, a missing setting or a failed lookup ends the request with a refusal, never with a default that grants access.
- **No existence leaks**: a ticket outside the agent's departments answers 404 (not 403); webhooks answer 404 on a bad secret.
- **Typed GraphQL only**: every value reaches GraphQL as a declared variable; never build GraphQL or JSON by string concatenation of user input (hash literals + `| json` for API bodies).
- **Module boundary**: module code references only `modules/support`, `modules/core`, `modules/user`, `modules/common-styling`, and `modules/push_notifications`; the static gate checks it (as pos-module-mcp does).
- **Profiles**: permission checks and ownership use profiles (D-22).


- **CSRF**: every `method: post` page under `support-desk` refuses when `context.csrf_request_valid` is false (it is not enforced for you), returning 422 JSON or a redirect with an error.
- Webhooks (`api/support/*`): no session; authenticated by the secret path segment; constant comparison; respond 404 on mismatch.
- Params are strings: compare booleans with `== 'true'`.
- Output: user content rendered with auto-escaping `{{ }}`; sanitised email HTML is rendered inside a sandboxed `<iframe srcdoc>` with `sandbox=""` (no scripts, no same-origin) so customer HTML cannot style or script the app; never `html_safe` user text.
- Attachments: private ACL; served only through the permission-checked redirect with short-lived signed URLs.
- Rate limits: inbound per sender (04 §2.4); profile switch POSTs per user 60/min; bulk actions max 200 tickets.
- Secrets live only in constants: `modules/support/EMAIL_API_KEY`, `INBOUND_SECRET`, `EVENTS_SECRET`, `REPLY_TOKEN_SECRET` (all prefixed `modules/support/`). Read as `context.constants['modules/support/…']`. Never logged, never rendered.
- Logging: `log` only ids and states; never email bodies or addresses at `error` level in production.

## 3. Install generator — `modules/support/generators/install/index.js`

Yeoman generator in the style of `push_notifications/generators/install`. Run: `pos-cli generate run modules/support/generators/install`.

Steps, each confirmable:
0. **Admin menu entry**: keep `pages/admin/support.liquid` (redirect into the desk, listed in host admin menus built from `admin_pages`) — default yes; "no" writes an empty override `app/modules/support/public/views/pages/admin/support.liquid` that answers 404.
1. **First support admin** on a chosen environment: ask for an email. Existing user → create the `team_member` `{role: admin, source: install}` with a GraphQL call to that environment. No user → create it with `roles: []` and a password typed at the prompt, sent straight to the environment (never written to a file), as the user module's generator does for superadmin. Also set constant `modules/support/ADMIN_EMAILS` (recovery, comma-separated) to that email.
1a. **Public sign-up**: if the host's permissions give `anonymous` the `users.register` permission, say so and ask whether that is intended; recommend turning it off for sites without members (marketing sites). The generator only reports — it does not edit the host's permissions file.
1b. **Role mapping** (optional, default none): offer the host's roles that grant `admin_pages.view` and ask whether any should map to a support role (writes `setting.role_map`).
2. **Host theme hook**: create `app/lib/hooks/hook_headscripts.liquid` returning the host's own stylesheet links found in `app/views/layouts/application.liquid` (`<link rel="stylesheet" …>` lines that are not module assets), if the hook does not exist. If it exists, leave it.
3. **Branding hook**: create `app/lib/hooks/hook_support_branding.liquid` with placeholders the host fills in (name, logos, icon, theme colour).
4. **Email provider** on a chosen environment: ask for the provider (`sendgrid` is the only adapter in the MVP), its API key (constant `EMAIL_API_KEY`) and the inbound domain or address (setting `inbound_domain`); generate `INBOUND_SECRET`, `EVENTS_SECRET`, `REPLY_TOKEN_SECRET` (32 random bytes, hex). Nothing is written into module files. All of it can be changed later in Settings → Email.
5. **Push keys**: if `modules/push_notifications/VAPID_PUBLIC_KEY` is missing, run the push module's own generator steps (or print its manual step text).
6. Print the provider's setup instructions (the adapter's `setup_instructions`: DNS records, inbound URL, events URL).

## 4. Migrations (seed)

`modules/support/public/migrations/<timestamp>_support_seed.liquid`, idempotent (find-or-create by key):
- statuses (03 §4), default department "Support", default SLA policy (P0 30/60/1440 calendar; P1 120/240/4320 business; P2 480/1440/14400 business; P3 1440/2880/— business; Mon–Fri 09:00–17:00 in the time zone given at install, default UTC; editable in Settings → Business hours (TASK-18). Our installation and support-dev use America/Chicago), settings (`confirmation_mode` auto_close, `confirmation_wait_days` 7, `unassigned_alert_minutes` 15, `unassigned_alert_minutes_p0` 5, `escalate_after_minutes` 30, `spam_threshold` 5.0, `free_mail_domains` list), counter `ticket_number` = 1000.
- `…_support_start_sweep.liquid`: enqueue the first sweep job.

Our platformOS installation adds an app-level migration that creates DOB, Accela and DesksNearMe departments and imports Zoho (MG-1..MG-4).

## 5. Zoho import (MG-1..MG-4) — app-level, not in the module, and not in the MVP build (D-19: right after, TASK-28)

A one-off script in our app repo (not distributed): Node script using the Zoho Desk API exports open tickets + 12 months of closed ones with threads, contacts, accounts, departments, agents to CSV/JSON; then `data-import` (pos-cli MCP) or a migration that calls module commands with `channel: import`, preserving `legacy_number` and every original Message-ID (so replies to old Zoho mail thread). Dry run on staging with a reconciliation report before cutover.
